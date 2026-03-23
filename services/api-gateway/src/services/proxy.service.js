const axios = require("axios");

async function proxyRequest(method, url, data) {
  const response = await axios({
    method,
    url,
    data
  });

  return response.data;
}

module.exports = { proxyRequest };