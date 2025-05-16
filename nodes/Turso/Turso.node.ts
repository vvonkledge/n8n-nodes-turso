import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	INodePropertyOptions,
	ILoadOptionsFunctions,
	NodeConnectionType,
} from 'n8n-workflow';

import { createClient, LibsqlError } from '@libsql/client';

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

/**
 * Helper function to handle database errors consistently
 */
function handleDatabaseError(
	context: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
	operation: string,
): never {
	// Handle libSQL specific errors
	if (error instanceof LibsqlError) {
		const errorMessage = `Database error in "${operation}": ${error.message}`;
		throw new NodeOperationError(context.getNode(), errorMessage, {
			itemIndex,
			description: `Error code: ${error.code || 'unknown'}`,
		});
	}

	// Handle connection errors
	if (error instanceof Error && error.message.includes('connection')) {
		throw new NodeOperationError(
			context.getNode(),
			`Connection error: ${error.message}. Please check your credentials and database URL.`,
			{ itemIndex },
		);
	}

	// Handle any other errors
	if (error instanceof Error) {
		throw new NodeOperationError(context.getNode(), `Error in "${operation}": ${error.message}`, { itemIndex });
	}

	// Fallback for unknown error types
	throw new NodeOperationError(context.getNode(), `Unknown error in "${operation}"`, { itemIndex });
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
		usableAsTool: true,
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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
					{
						name: 'Insert Rows',
						value: 'insertRows',
						description: 'Insert rows into a table',
						action: 'Insert rows into a table',
					},
					{
						name: 'Select Rows',
						value: 'selectRows',
						description: 'Select rows from a table',
						action: 'Select rows from a table',
					},
					{
						name: 'Update Rows',
						value: 'updateRows',
						description: 'Update rows in a table',
						action: 'Update rows in a table',
					},
					{
						name: 'Delete Rows',
						value: 'deleteRows',
						description: 'Delete rows from a table',
						action: 'Delete rows from a table',
					},
					{
						name: 'List Tables',
						value: 'listTables',
						description: 'List all tables in the database',
						action: 'List all tables in the database',
					},
					{
						name: 'Describe Table',
						value: 'describeTable',
						description: 'Get schema information about a table',
						action: 'Get schema information about a table',
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
			// Insert rows
			{
				displayName: 'Table Name',
				name: 'table',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTables',
				},
				displayOptions: {
					show: {
						operation: ['insertRows', 'updateRows', 'describeTable', 'deleteRows', 'selectRows'],
					},
				},
				default: '',
				required: true,
				description: 'Name of the table',
			},
			{
				displayName: 'Columns',
				name: 'columns',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getColumns',
					loadOptionsDependsOn: ['table'],
				},
				displayOptions: {
					show: {
						operation: ['insertRows', 'updateRows', 'selectRows'],
					},
				},
				default: [],
				required: true,
				description: 'Columns to include in the operation',
			},
			{
				displayName: 'Data Source',
				name: 'dataSource',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['insertRows', 'updateRows'],
					},
				},
				options: [
					{
						name: 'Input Items',
						value: 'inputItems',
						description: 'Use the incoming items as data source',
					},
					{
						name: 'Manual Input',
						value: 'manualInput',
						description: 'Enter the data manually',
					},
				],
				default: 'inputItems',
			},
			{
				displayName: 'Values to Insert',
				name: 'values',
				placeholder: 'Add Value',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['insertRows', 'updateRows'],
						dataSource: ['manualInput'],
					},
				},
				default: {},
				options: [
					{
						name: 'valueItems',
						displayName: 'Values',
						values: [
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value to insert',
							},
						],
					},
				],
				description: 'Values to insert in the row',
			},
			{
				displayName: 'Item Property',
				name: 'itemsPath',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['insertRows', 'updateRows'],
						dataSource: ['inputItems'],
					},
				},
				default: 'data',
				description: 'The name of the property which contains the values for insert/update. Leave blank if the items themselves are the values.',
			},
			{
				displayName: 'Where Clause',
				name: 'whereClause',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['updateRows', 'deleteRows'],
					},
				},
				default: '',
				placeholder: 'id = ?',
				description: 'WHERE condition for the operation (without the "WHERE" keyword)',
				required: true,
			},
			{
				displayName: 'Where Parameters',
				name: 'whereParams',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['updateRows', 'deleteRows'],
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
								description: 'Value for the where parameter',
							},
						],
					},
				],
				description: 'Parameters for the WHERE clause in order of appearance (?)',
			},
			// Add Select All Columns option
			{
				displayName: 'Select All Columns',
				name: 'selectAllColumns',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['selectRows'],
					},
				},
				default: false,
				description: 'Whether to select all columns using *',
			},
			// Where clause for select
			{
				displayName: 'Use Where Clause',
				name: 'useWhere',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['selectRows'],
					},
				},
				default: false,
				description: 'Whether to add a WHERE clause to filter results',
			},
			// Where clause for select with condition
			{
				displayName: 'Where Clause',
				name: 'whereClauseSelect',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useWhere: [true],
					},
				},
				default: '',
				placeholder: 'id = ?',
				description: 'WHERE condition for the select (without the "WHERE" keyword)',
				required: true,
			},
			// Where parameters for select
			{
				displayName: 'Where Parameters',
				name: 'whereParamsSelect',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useWhere: [true],
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
								description: 'Value for the where parameter',
							},
						],
					},
				],
				description: 'Parameters for the WHERE clause in order of appearance (?)',
			},
			// Order By for Select
			{
				displayName: 'Use Order By',
				name: 'useOrderBy',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['selectRows'],
					},
				},
				default: false,
				description: 'Whether to add an ORDER BY clause',
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getColumns',
					loadOptionsDependsOn: ['table'],
				},
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useOrderBy: [true],
					},
				},
				default: '',
				description: 'Column to order results by',
			},
			{
				displayName: 'Order Direction',
				name: 'orderDirection',
				type: 'options',
				options: [
					{
						name: 'Ascending (ASC)',
						value: 'ASC',
					},
					{
						name: 'Descending (DESC)',
						value: 'DESC',
					},
				],
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useOrderBy: [true],
					},
				},
				default: 'ASC',
				description: 'The direction to order results by',
			},
			// Limit and Offset for Select
			{
				displayName: 'Use Limit',
				name: 'useLimit',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['selectRows'],
					},
				},
				default: false,
				description: 'Whether to limit the number of results',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useLimit: [true],
					},
				},
				default: 100,
				description: 'Maximum number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: {
					minValue: 0,
				},
				displayOptions: {
					show: {
						operation: ['selectRows'],
						useLimit: [true],
					},
				},
				default: 0,
				description: 'Number of results to skip',
			},
		],
	};

	methods = {
		loadOptions: {
			async getTables(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];

				try {
					// Get credentials and connect to database
					const credentials = await this.getCredentials('tursoDb');

					if (!credentials.databaseUrl || !credentials.authToken) {
						throw new Error('Database URL and auth token are required');
					}

					const client = createClient({
						url: credentials.databaseUrl as string,
						authToken: credentials.authToken as string,
					});

					// Fetch tables
					const result = await client.execute({
						sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
						args: [],
					});

					// Add tables to options
					for (const row of result.rows || []) {
						const tableName = (row as any).name;
						returnData.push({
							name: tableName,
							value: tableName,
						});
					}
				} catch (error) {
					// We can't use NodeOperationError in load options methods
					console.error('Error loading tables:', error);
					returnData.push({
						name: 'Error loading tables',
						value: '',
						description: error instanceof Error ? error.message : 'Unknown error',
					});
				}

				return returnData;
			},
			async getColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];

				try {
					// Get the currently selected table
					const currentTable = this.getCurrentNodeParameter('table') as string;

					if (!currentTable) {
						return returnData;
					}

					// Get credentials and connect to database
					const credentials = await this.getCredentials('tursoDb');

					if (!credentials.databaseUrl || !credentials.authToken) {
						throw new Error('Database URL and auth token are required');
					}

					const client = createClient({
						url: credentials.databaseUrl as string,
						authToken: credentials.authToken as string,
					});

					// Fetch columns
					const result = await client.execute({
						sql: `PRAGMA table_info(${currentTable})`,
						args: [],
					});

					// Add columns to options
					for (const row of result.rows || []) {
						const columnName = (row as any).name;
						const columnType = (row as any).type;
						returnData.push({
							name: `${columnName} (${columnType})`,
							value: columnName,
						});
					}
				} catch (error) {
					// We can't use NodeOperationError in load options methods
					console.error('Error loading columns:', error);
					returnData.push({
						name: 'Error loading columns',
						value: '',
						description: error instanceof Error ? error.message : 'Unknown error',
					});
				}

				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		let responseData;

		// Create a db client once for all items
		let client;
		try {
			const credentials = await this.getCredentials('tursoDb');

			if (!credentials.databaseUrl || !credentials.authToken) {
				throw new NodeOperationError(this.getNode(), 'Database URL and auth token are required');
			}

			client = createClient({
				url: credentials.databaseUrl as string,
				authToken: credentials.authToken as string,
			});
		} catch (error) {
			// Handle connection setup errors
			if (error instanceof NodeOperationError) {
				throw error;
			}
			throw new NodeOperationError(
				this.getNode(),
				`Error connecting to Turso database: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				// Handle database operations with libsql client
				if (operation === 'executeQuery') {
					const query = this.getNodeParameter('query', i) as string;

					if (!query || query.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'SQL query cannot be empty', { itemIndex: i });
					}

					const queryParameters = this.getNodeParameter('queryParams.params', i, []) as Array<{
						value: string;
					}>;

					const args = queryParameters.map(param => param.value);

					try {
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
					} catch (error) {
						handleDatabaseError(this, error, i, 'Execute Query');
					}

				} else if (operation === 'executeBatch') {
					const queries = this.getNodeParameter('queries.queryValues', i, []) as Array<{
						query: string;
						parameters: string;
					}>;

					if (queries.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one query is required for batch execution', { itemIndex: i });
					}

					const results: ProcessedResult[] = [];

					for (const queryItem of queries) {
						const { query, parameters } = queryItem;

						if (!query || query.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'SQL query cannot be empty', { itemIndex: i });
						}

						const args = parameters ? parameters.split(',').map(p => p.trim()) : [];

						try {
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
						} catch (error) {
							handleDatabaseError(this, error, i, `Execute Batch - Query: ${query}`);
						}
					}

					responseData = results;
				} else if (operation === 'insertRows') {
					const table = this.getNodeParameter('table', i) as string;

					if (!table || table.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Table name cannot be empty', { itemIndex: i });
					}

					const selectedColumns = this.getNodeParameter('columns', i) as string[];

					if (!selectedColumns || selectedColumns.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one column must be selected', { itemIndex: i });
					}

					const dataSource = this.getNodeParameter('dataSource', i) as string;

					const columnNames = selectedColumns;
					const placeholders = columnNames.map(() => '?').join(', ');

					let rows: any[][] = [];

					if (dataSource === 'manualInput') {
						const valueItems = this.getNodeParameter('values.valueItems', i, []) as Array<{ value: string }>;

						if (valueItems.length === 0) {
							throw new NodeOperationError(this.getNode(), 'No values provided for insert operation', { itemIndex: i });
						}

						// Group values by rows
						const valuesPerRow = columnNames.length;
						const values = valueItems.map(item => item.value);

						if (values.length % valuesPerRow !== 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Values count (${values.length}) is not a multiple of columns count (${valuesPerRow})`,
								{ itemIndex: i },
							);
						}

						for (let j = 0; j < values.length; j += valuesPerRow) {
							const row = values.slice(j, j + valuesPerRow);
							rows.push(row);
						}
					} else { // inputItems
						const itemsPath = this.getNodeParameter('itemsPath', i, 'data') as string;

						// Get data from incoming items
						for (const item of items) {
							let rowData: any;

							if (itemsPath) {
								rowData = item.json[itemsPath];

								if (rowData === undefined) {
									throw new NodeOperationError(
										this.getNode(),
										`Item path '${itemsPath}' not found in input data`,
										{ itemIndex: i },
									);
								}
							} else {
								rowData = item.json;
							}

							// If it's an array of objects, extract values in the right order
							if (Array.isArray(rowData)) {
								for (const entry of rowData) {
									const row = columnNames.map(name => entry[name]);
									rows.push(row);
								}
							} else if (typeof rowData === 'object' && rowData !== null) {
								// If it's an object, extract values in the right order
								const row = columnNames.map(name => rowData[name]);
								rows.push(row);
							}
						}

						if (rows.length === 0) {
							throw new NodeOperationError(this.getNode(), 'No data found to insert', { itemIndex: i });
						}
					}

					// Execute insert queries
					const results: ProcessedResult[] = [];

					for (const row of rows) {
						const query = `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${placeholders})`;

						try {
							const result = await client.execute({
								sql: query,
								args: row,
							});

							results.push({
								rowsAffected: result.rowsAffected,
								lastInsertRowid: result.lastInsertRowid,
							} as ProcessedResult);
						} catch (error) {
							handleDatabaseError(this, error, i, 'Insert Rows');
						}
					}

					responseData = results;
				} else if (operation === 'updateRows') {
					const table = this.getNodeParameter('table', i) as string;

					if (!table || table.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Table name cannot be empty', { itemIndex: i });
					}

					const selectedColumns = this.getNodeParameter('columns', i) as string[];

					if (!selectedColumns || selectedColumns.length === 0) {
						throw new NodeOperationError(this.getNode(), 'At least one column must be selected', { itemIndex: i });
					}

					const whereClause = this.getNodeParameter('whereClause', i) as string;

					if (!whereClause || whereClause.trim() === '') {
						throw new NodeOperationError(
							this.getNode(),
							'WHERE clause is required for update operations for safety',
							{ itemIndex: i },
						);
					}

					const whereParams = this.getNodeParameter('whereParams.params', i, []) as Array<{ value: string }>;
					const whereArgs = whereParams.map(param => param.value);
					const dataSource = this.getNodeParameter('dataSource', i) as string;

					const columnNames = selectedColumns;
					const setClause = columnNames.map(col => `${col} = ?`).join(', ');

					let rows: any[][] = [];

					if (dataSource === 'manualInput') {
						const valueItems = this.getNodeParameter('values.valueItems', i, []) as Array<{ value: string }>;

						if (valueItems.length === 0) {
							throw new NodeOperationError(this.getNode(), 'No values provided for update operation', { itemIndex: i });
						}

						// Group values by rows
						const valuesPerRow = columnNames.length;
						const values = valueItems.map(item => item.value);

						if (values.length % valuesPerRow !== 0) {
							throw new NodeOperationError(
								this.getNode(),
								`Values count (${values.length}) is not a multiple of columns count (${valuesPerRow})`,
								{ itemIndex: i },
							);
						}

						for (let j = 0; j < values.length; j += valuesPerRow) {
							const row = values.slice(j, j + valuesPerRow);
							rows.push([...row, ...whereArgs]); // Combine row values with where args
						}
					} else { // inputItems
						const itemsPath = this.getNodeParameter('itemsPath', i, 'data') as string;

						// Get data from incoming items
						for (const item of items) {
							let rowData: any;

							if (itemsPath) {
								rowData = item.json[itemsPath];

								if (rowData === undefined) {
									throw new NodeOperationError(
										this.getNode(),
										`Item path '${itemsPath}' not found in input data`,
										{ itemIndex: i },
									);
								}
							} else {
								rowData = item.json;
							}

							// If it's an array of objects, extract values in the right order
							if (Array.isArray(rowData)) {
								for (const entry of rowData) {
									const row = columnNames.map(name => entry[name]);
									rows.push([...row, ...whereArgs]); // Combine row values with where args
								}
							} else if (typeof rowData === 'object' && rowData !== null) {
								// If it's an object, extract values in the right order
								const row = columnNames.map(name => rowData[name]);
								rows.push([...row, ...whereArgs]); // Combine row values with where args
							}
						}

						if (rows.length === 0) {
							throw new NodeOperationError(this.getNode(), 'No data found to update', { itemIndex: i });
						}
					}

					// Execute update queries
					const results: ProcessedResult[] = [];

					for (const row of rows) {
						const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

						try {
							const result = await client.execute({
								sql: query,
								args: row,
							});

							results.push({
								rowsAffected: result.rowsAffected,
							} as ProcessedResult);
						} catch (error) {
							handleDatabaseError(this, error, i, 'Update Rows');
						}
					}

					responseData = results;
				} else if (operation === 'deleteRows') {
					const table = this.getNodeParameter('table', i) as string;

					if (!table || table.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Table name cannot be empty', { itemIndex: i });
					}

					const whereClause = this.getNodeParameter('whereClause', i) as string;

					if (!whereClause || whereClause.trim() === '') {
						throw new NodeOperationError(
							this.getNode(),
							'WHERE clause is required for delete operations for safety',
							{ itemIndex: i },
						);
					}

					const whereParams = this.getNodeParameter('whereParams.params', i, []) as Array<{ value: string }>;
					const whereArgs = whereParams.map(param => param.value);

					const query = `DELETE FROM ${table} WHERE ${whereClause}`;

					try {
						const result = await client.execute({
							sql: query,
							args: whereArgs,
						});

						responseData = {
							rowsAffected: result.rowsAffected,
						};
					} catch (error) {
						handleDatabaseError(this, error, i, 'Delete Rows');
					}
				} else if (operation === 'selectRows') {
					const table = this.getNodeParameter('table', i) as string;

					if (!table || table.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Table name cannot be empty', { itemIndex: i });
					}

					const selectAllColumns = this.getNodeParameter('selectAllColumns', i) as boolean;

					let columnsList: string;
					if (selectAllColumns) {
						columnsList = '*';
					} else {
						const selectedColumns = this.getNodeParameter('columns', i) as string[];

						if (!selectedColumns || selectedColumns.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one column must be selected', { itemIndex: i });
						}

						columnsList = selectedColumns.join(', ');
					}

					const useWhere = this.getNodeParameter('useWhere', i, false) as boolean;
					let whereClause = '';
					let whereArgs: string[] = [];

					if (useWhere) {
						whereClause = this.getNodeParameter('whereClauseSelect', i) as string;

						if (!whereClause || whereClause.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'WHERE clause cannot be empty when "Use Where Clause" is enabled', { itemIndex: i });
						}

						const whereParams = this.getNodeParameter('whereParamsSelect.params', i, []) as Array<{ value: string }>;
						whereArgs = whereParams.map(param => param.value);
					}

					const useOrderBy = this.getNodeParameter('useOrderBy', i, false) as boolean;
					let orderByClause = '';

					if (useOrderBy) {
						const orderBy = this.getNodeParameter('orderBy', i) as string;

						if (!orderBy || orderBy.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Order by column must be selected when "Use Order By" is enabled', { itemIndex: i });
						}

						const orderDirection = this.getNodeParameter('orderDirection', i) as string;
						orderByClause = ` ORDER BY ${orderBy} ${orderDirection}`;
					}

					const useLimit = this.getNodeParameter('useLimit', i, false) as boolean;
					let limitOffsetClause = '';

					if (useLimit) {
						const limit = this.getNodeParameter('limit', i) as number;

						if (limit <= 0) {
							throw new NodeOperationError(this.getNode(), 'Limit must be greater than 0', { itemIndex: i });
						}

						limitOffsetClause = ` LIMIT ${limit}`;

						const offset = this.getNodeParameter('offset', i, 0) as number;
						if (offset > 0) {
							limitOffsetClause += ` OFFSET ${offset}`;
						}
					}

					let query = `SELECT ${columnsList} FROM ${table}`;

					if (useWhere) {
						query += ` WHERE ${whereClause}`;
					}

					query += orderByClause + limitOffsetClause;

					try {
						const result = await client.execute({
							sql: query,
							args: whereArgs,
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
						};
					} catch (error) {
						handleDatabaseError(this, error, i, 'Select Rows');
					}
				} else if (operation === 'listTables') {
					// In SQLite, query the sqlite_master table to list all tables
					try {
						const result = await client.execute({
							sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
							args: [],
						});

						const tables = result.rows?.map(row => (row as any).name) || [];

						responseData = {
							tables,
						};
					} catch (error) {
						handleDatabaseError(this, error, i, 'List Tables');
					}
				} else if (operation === 'describeTable') {
					const table = this.getNodeParameter('table', i) as string;

					if (!table || table.trim() === '') {
						throw new NodeOperationError(this.getNode(), 'Table name cannot be empty', { itemIndex: i });
					}

					// In SQLite, query the PRAGMA statement to get table info
					try {
						const result = await client.execute({
							sql: `PRAGMA table_info(${table})`,
							args: [],
						});

						responseData = {
							columns: result.rows || [],
						};
					} catch (error) {
						handleDatabaseError(this, error, i, 'Describe Table');
					}
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData ? { ...responseData } : {}),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
