# n8n-nodes-turso

This is an n8n node for interacting with Turso database.

## Prerequisites

- n8n instance (v0.107.0 or later)
- Turso account and database

## Installation

### In n8n Desktop App

1. Go to **Settings > Community Nodes**
2. Click **Install**
3. Enter `n8n-nodes-turso` in the "Install npm package" field
4. Click **Install**

### In your n8n instance

```bash
npm install n8n-nodes-turso
```

## Features

Interact directly with your Turso database using the libSQL client:

- **Execute Query**: Run SQL queries against your Turso database with support for parameterized queries.
- **Execute Batch**: Run multiple SQL queries in sequence.
- **Insert Rows**: Insert data into tables with support for data types (e.g., `id:int,name:text`).
- **Update Rows**: Update table data with WHERE clause filtering.
- **List Tables**: Get a list of all tables in your database.
- **Describe Table**: View schema information about a specific table.

## Authentication

This node requires Turso Database credentials:

- **Database URL**: The URL of your Turso database (obtained with `turso db show --url <database-name>`)
- **Auth Token**: The authentication token for your database (obtained with `turso db tokens create <database-name>`)

## Usage Examples

### Execute a SQL Query

1. Create a new workflow
2. Add the Turso node
3. Select "Execute Query" as the operation
4. Enter your SQL query (e.g., `SELECT * FROM users`)
5. Configure credentials and run the workflow

### Insert Data into a Table

1. Create a new workflow
2. Add the Turso node
3. Select "Insert Rows" as the operation
4. Enter your table name and column definitions
5. Choose data source (Input Items or Manual Input)
6. Provide values to insert
7. Configure credentials and run the workflow

### Execute Multiple Queries in Batch

1. Create a new workflow
2. Add the Turso node
3. Select "Execute Batch" as the operation
4. Add multiple queries you want to execute
5. Configure credentials and run the workflow

## Contributing

Feel free to contribute to this node by opening issues or submitting pull requests on the [GitHub repository](https://github.com/n8n-io/n8n-nodes-turso). 
