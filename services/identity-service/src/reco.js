const { Client } = require("pg");
const bcrypt = require("bcrypt");

(async () => {
  try {
    const client = new Client({
      connectionString: "postgresql://root@localhost:26257/identity_db?sslmode=disable",
    });

    await client.connect();

    const email = "admin@banque.tn";
    const newPassword = "admin123";
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const res = await client.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, username`,
      [passwordHash, email]
    );

    if (res.rowCount === 0) {
      console.log("User not found");
    } else {
      console.log("Password reset successful!");
      console.log("User ID:", res.rows[0].id);
      console.log("Username:", res.rows[0].username);
      console.log("Email:", email);
      console.log("New password:", newPassword);
    }

    await client.end();
  } catch (err) {
    console.error("Error:", err);
  }
})();