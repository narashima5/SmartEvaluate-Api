const { onRequest } = require("firebase-functions/v2/https");
const app = require("./server");

// Export the Express app as a Firebase Cloud Function named 'api'
exports.api = onRequest({ cors: true, maxInstances: 10 }, app);
