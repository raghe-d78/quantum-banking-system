const express = require("express")
const createPool = require("../../shared/db")

const pool = createPool("account_db")

const app = express()
app.use(express.json())

app.post("/account", async (req,res)=>{

  const {userId} = req.body

  const result = await pool.query(
    "INSERT INTO accounts(user_id) VALUES($1) RETURNING *",
    [userId]
  )

  res.json(result.rows[0])
})

app.get("/account/:userId", async (req,res)=>{

  const result = await pool.query(
    "SELECT * FROM accounts WHERE user_id=$1",
    [req.params.userId]
  )

  res.json(result.rows[0])
})

app.listen(3002, ()=> console.log("Account service running"))