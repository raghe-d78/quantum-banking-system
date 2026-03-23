// const express = require("express");
// const cors = require("cors");

// const authRoutes = require("./routes/auth.routes");
// const accountRoutes = require("./routes/account.routes");

// const app = express();

// app.use(cors());
// app.use(express.json());

// app.use("/auth", authRoutes);
// app.use("/accounts", accountRoutes);

// app.get("/health", (req, res) => {
//   res.json({ status: "gateway running" });
// });

// const PORT = process.env.PORT || 8000;

// app.listen(PORT, () => {
//   console.log(`API Gateway running on port ${PORT}`);
// });

const express = require("express")
const axios = require("axios")

const app = express()
app.use(express.json())

app.post("/auth/register", async (req,res)=>{
  const r = await axios.post("http://identity-service:3001/register", req.body)
  res.json(r.data)
})

app.post("/auth/login", async (req,res)=>{
  const r = await axios.post("http://identity-service:3001/login", req.body)
  res.json(r.data)
})

app.post("/account", async (req,res)=>{
  const r = await axios.post("http://account-service:3002/account", req.body)
  res.json(r.data)
})

app.get("/account/:id", async (req,res)=>{
  const r = await axios.get(`http://account-service:3002/account/${req.params.id}`)
  res.json(r.data)
})

app.listen(3000, ()=> console.log("Gateway running"))