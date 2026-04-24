// Simple Express server just to serve the instructions page in the IDE Web Preview
const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('./'));

app.listen(port, () => {
  console.log(`Instruction server running on port ${port}`);
});