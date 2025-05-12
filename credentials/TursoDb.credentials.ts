import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TursoDb implements ICredentialType {
	name = 'tursoDb';
	displayName = 'Turso Database';
	documentationUrl = 'https://docs.turso.tech/';
	properties: INodeProperties[] = [
		{
			displayName: 'Database URL',
			name: 'databaseUrl',
			type: 'string',
			default: '',
			placeholder: 'libsql://your-database.turso.io',
			description: 'The URL of your Turso database. Get this by running: turso db show --url <database-name>',
			required: true,
		},
		{
			displayName: 'Auth Token',
			name: 'authToken',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			description: 'The database authentication token. Get this by running: turso db tokens create <database-name>',
			required: true,
		},
	];
}
