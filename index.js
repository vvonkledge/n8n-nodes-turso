module.exports = {
  credentials: {
    TursoDb: {
      nodeClass: 'TursoDb',
      sourcePath: './dist/credentials/TursoDb.credentials.js',
    },
  },
  nodes: {
    Turso: {
      nodeClass: 'Turso',
      sourcePath: './dist/nodes/Turso/Turso.node.js',
    },
  },
};
