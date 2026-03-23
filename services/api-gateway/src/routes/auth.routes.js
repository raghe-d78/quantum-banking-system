const express = require("express");
const router = express.Router();
const { proxyRequest } = require("../services/proxy.service");

const IDENTITY_SERVICE = "http://identity-service:8000";

router.post("/register", async (req, res) => {
  const data = await proxyRequest(
    "post",
    `${IDENTITY_SERVICE}/register`,
    req.body
  );

  res.json(data);
});

module.exports = router;