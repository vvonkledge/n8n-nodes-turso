# Turso Node

This node allows you to interact with a Turso database using the libSQL client.

## Prerequisites

- n8n instance (v0.107.0 or later)
- Turso account and database

## Operations

### Execute Query

Run SQL queries against your Turso database with support for parameterized queries.

**Parameters:**
- **Query**: The SQL query to execute
- **Query Parameters**: Parameters for the query in order of appearance (?)

### Execute Batch

Run multiple SQL queries in sequence.

**Parameters:**
- **Queries**: List of SQL queries to execute, each with optional parameters

### Insert Rows

Insert data into a table. Supports both manual input and data from previous nodes.

**Parameters:**
- **Table Name**: Name of the table to insert data into
- **Columns**: Comma-separated list of columns with optional type specification (e.g., `id:int,name:text,email:text`)
- **Data Source**: Choose between 'Input Items' or 'Manual Input'
- **Values to Insert**: Values to insert when using manual input
- **Item Property**: JSON property containing values when using input items

### Update Rows

Update data in a table based on a WHERE clause.

**Parameters:**
- **Table Name**: Name of the table to update
- **Columns**: Comma-separated list of columns to update
- **Where Clause**: Condition for the update (without the "WHERE" keyword)
- **Where Parameters**: Parameters for the WHERE clause
- **Data Source**: Choose between 'Input Items' or 'Manual Input'
- **Values to Update**: Values to update when using manual input
- **Item Property**: JSON property containing values when using input items

### List Tables

List all tables in the database.

**Parameters:**
- None

### Describe Table

Get schema information about a table.

**Parameters:**
- **Table Name**: Name of the table to describe

## Example Usage

### Basic Query

1. Add the Turso node
2. Select "Execute Query" operation
3. Enter your SQL query: `SELECT * FROM users WHERE id = ?`
4. Add a query parameter: `1`
5. Run the workflow

### Insert Data

1. Add the Turso node
2. Select "Insert Rows" operation
3. Enter table name: `users`
4. Enter columns: `id:int,name:text,email:text`
5. Select data source: "Manual Input"
6. Add values: `1`, `John Doe`, `john@example.com`
7. Run the workflow
