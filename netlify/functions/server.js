const serverless = require('serverless-http');
const app = require('../../dist/app.js').default;

// Export the handler for Netlify Functions
exports.handler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/zip'],
});

