import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { createClient } from '@libsql/client';

// Define interfaces for our result processing
interface ResultColumn {
	name: string;
}

interface ProcessedResult {
	columns: string[];
	rows: unknown[];
	rowsAffected?: number;
	lastInsertRowid?: string | number;
}

export class Turso implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Turso',
		name: 'turso',
		icon: 'file:turso.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Execute operations on Turso database',
		defaults: {
			name: 'Turso',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'tursoDb',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Execute Query',
						value: 'executeQuery',
						description: 'Execute a SQL query',
						action: 'Execute a SQL query',
					},
					{
						name: 'Execute Batch',
						value: 'executeBatch',
						description: 'Execute multiple SQL queries as a batch',
						action: 'Execute multiple SQL queries as a batch',
					},
				],
				default: 'executeQuery',
			},
			// SQL query parameters
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						operation: ['executeQuery'],
					},
				},
				default: '',
				placeholder: 'SELECT * FROM users',
				description: 'The SQL query to execute',
				required: true,
			},
			// Query parameters
			{
				displayName: 'Query Parameters',
				name: 'queryParams',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['executeQuery'],
					},
				},
				default: {},
				placeholder: 'Add Parameter',
				options: [
					{
						name: 'params',
						displayName: 'Parameter',
						values: [
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value for the query parameter',
							},
						],
					},
				],
				description: 'Parameters for the SQL query in order of appearance (?)',
			},
			// Batch queries
			{
				displayName: 'Queries',
				name: 'queries',
				placeholder: 'Add Query',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['executeBatch'],
					},
				},
				default: {},
				options: [
					{
						name: 'queryValues',
						displayName: 'Query',
						values: [
							{
								displayName: 'Query',
								name: 'query',
								type: 'string',
								default: '',
								description: 'The SQL query to execute',
								typeOptions: {
									rows: 2,
								},
								required: true,
							},
							{
								displayName: 'Parameters',
								name: 'parameters',
								type: 'string',
								default: '',
								description: 'Parameters for the SQL query as a comma-separated list',
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		let responseData;

		for (let i = 0; i < items.length; i++) {
			try {
				// Handle database operations with libsql client
				const credentials = await this.getCredentials('tursoDb');

				if (!credentials.databaseUrl || !credentials.authToken) {
					throw new NodeOperationError(this.getNode(), 'Database URL and auth token are required');
				}

				const client = createClient({
					url: credentials.databaseUrl as string,
					authToken: credentials.authToken as string,
				});

				if (operation === 'executeQuery') {
					const query = this.getNodeParameter('query', i) as string;
					const queryParameters = this.getNodeParameter('queryParams.params', i, []) as Array<{
						value: string;
					}>;

					const args = queryParameters.map(param => param.value);

					const result = await client.execute({
						sql: query,
						args,
					});

					// Process the result in a type-safe manner
					const columnNames = result.columns?.map(column => {
						// The column can be either an object with a name property or a string
						if (typeof column === 'string') {
							return column;
						}
						// Otherwise it should be an object with a name property
						return (column as unknown as ResultColumn).name;
					}) || [];

					responseData = {
						columns: columnNames,
						rows: result.rows || [],
						rowsAffected: result.rowsAffected,
						lastInsertRowid: result.lastInsertRowid,
					} as ProcessedResult;

				} else if (operation === 'executeBatch') {
					const queries = this.getNodeParameter('queries.queryValues', i, []) as Array<{
						query: string;
						parameters: string;
					}>;

					const results: ProcessedResult[] = [];

					for (const queryItem of queries) {
						const { query, parameters } = queryItem;
						const args = parameters ? parameters.split(',').map(p => p.trim()) : [];

						const result = await client.execute({
							sql: query,
							args,
						});

						// Process the result in a type-safe manner
						const columnNames = result.columns?.map(column => {
							// The column can be either an object with a name property or a string
							if (typeof column === 'string') {
								return column;
							}
							// Otherwise it should be an object with a name property
							return (column as unknown as ResultColumn).name;
						}) || [];

						results.push({
							columns: columnNames,
							rows: result.rows || [],
							rowsAffected: result.rowsAffected,
							lastInsertRowid: result.lastInsertRowid,
						} as ProcessedResult);
					}

					responseData = results;
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);

			} catch (error) {
				if (this.continueOnFail()) {
					const executionErrorData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: i } },
					);
					returnData.push(...executionErrorData);
					continue;
				}
				throw error;
			}
		}

		return this.prepareOutputData(returnData);
	}
}
