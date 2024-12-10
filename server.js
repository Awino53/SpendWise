const express = require("express");
const app = express();
const mysql = require("mysql");
const bodyParser = require("body-parser");

const bcrypt = require("bcrypt"); // Import bcrypt
const SALT_ROUNDS = 10; // Define the number of salt rounds

const session = require("express-session");

app.use(
  session({
    secret: "your_secret_key", // You should use a unique, secret key for session encryption
    resave: false,
    saveUninitialized: true,
  })
);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static("public"));

// Database Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "WiseApp",
});

db.connect((err) => {
  if (err) throw err;
  console.log("MySQL Connected...");
});

// Middleware to check if a user is logged in
function isAuthenticated(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}
// Routes

// Register route
app.get("/register", (req, res) => {
  res.render("register"); // Render the registration form
});

// Handle registration
app.post("/register", (req, res) => {
  const { email, full_name, password, confirm_password, date_of_birth } =
    req.body;

  if (!email || !full_name || !password || !confirm_password) {
    // You can add basic validation here if needed, like checking empty fields
    return res.redirect("/register");
  }
  // Check if passwords match
  if (password !== confirm_password) {
    return res.render("register", { error: "Passwords do not match." }); // You can send an error message to the registration page
  }

  const sqlCheckEmail = "SELECT * FROM users WHERE email = ?";
  db.query(sqlCheckEmail, [email], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.redirect("/register"); // Redirect to registration page if an error occurs
    }

    if (results.length > 0) {
      return res.redirect("/register"); // Redirect if email is already registered
    }

    // Hash the password before saving
    bcrypt.hash(password, SALT_ROUNDS, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res.redirect("/register");
      }

      const sql =
        "INSERT INTO users (email, full_name, password, date_of_birth) VALUES (?, ?, ?, ?)";
      db.query(
        sql,
        [email, full_name, hashedPassword, date_of_birth], // Use the hashedPassword here
        (err, result) => {
          if (err) {
            console.error("Error during registration:", err);
            return res.redirect("/register"); // Redirect on error
          }

          req.session.userId = result.insertId;
          res.redirect("/"); // Redirect to home page after successful registration
        }
      );
    });
  });
});

// Login route
app.get("/login", (req, res) => {
  res.render("login"); // Render the login form
});

// Handle login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render("login", { error: "Email and password are required." });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error("Error during authentication:", err);
      return res.status(500).send("Error during authentication.");
    }

    if (results.length === 0) {
      return res.render("login", { error: "Invalid credentials." });
    }

    const user = results[0];

    // Compare the hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error("Error comparing passwords:", err);
        return res.status(500).send("Error during authentication.");
      }

      if (!isMatch) {
        return res.render("login", { error: "Invalid credentials." });
      }

      // If authentication is successful, set the session
      req.session.userId = user.user_id;
      req.session.userName = user.full_name;

      return res.redirect("/");
    });
  });
});

/* home route */
app.get("/", (req, res) => {
  if (req.session.userId) {
    // Redirect to /transactions if the user is logged in
    return res.redirect("/transactions");
  }

  // Otherwise, render the home page
  res.render("home");
});

// View Transactions

// Add Transaction Page (GET request)
app.get("/transactions", isAuthenticated, (req, res) => {
  const userId = req.session.userId;

  // Fetch transactions
  const transactionQuery = "SELECT * FROM transactions WHERE user_id = ?";
  db.query(transactionQuery, [userId], (err, transactions) => {
    if (err) return res.status(500).send("Error fetching transactions.");

    // Fetch debts
    const debtQuery =
      "SELECT * FROM transactions WHERE user_id = ? AND type = 'DEBT'";
    db.query(debtQuery, [userId], (err, debts) => {
      if (err) return res.status(500).send("Error fetching debts.");

      const user = { fullName: req.session.userName }; // Add user data
      res.render("transactions", { transactions, debts, user }); // Pass debts to view
    });
  });
});

// Add Transaction

// Add Transaction (POST request)
app.post("/transactions", isAuthenticated, (req, res) => {
  const {
    type,
    category,
    amount,
    description,
    transaction_date,
    is_recurrent,
    debt_id,
  } = req.body;

  // Validate type
  if (
    !type ||
    !["EXPENSE", "INCOME", "SAVING", "DEBT"].includes(type.toUpperCase())
  ) {
    return res.status(400).send("Invalid transaction type.");
  }

  const userId = req.session.userId;

  let query = `
    INSERT INTO transactions (user_id, type, category, amount, description, transaction_date, is_recurrent
  `;
  let params = [
    userId,
    type,
    category,
    amount,
    description,
    transaction_date,
    is_recurrent || 0,
  ];

  // If it's a debt payment, include debt_id in the query
  if (debt_id) {
    query += ", debt_id";
    params.push(debt_id);
  }

  query += ") VALUES (?, ?, ?, ?, ?, ?, ?)";

  db.query(query, params, (err) => {
    if (err) return res.status(500).send("Error adding transaction.");
    res.redirect("/transactions");
  });
});

//delete transaction
app.delete("/transactions/:id", isAuthenticated, (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const query =
    "DELETE FROM transactions WHERE transaction_id = ? AND user_id = ?";

  db.query(query, [id, userId], (err) => {
    if (err) return res.status(500).send("Error deleting transaction.");
    res.status(200).send({ success: true });
  });
});

// View Savings
app.get("/savings", isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const query =
    "SELECT * FROM transactions WHERE user_id = ? AND type = 'SAVING'";
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).send("Error fetching savings.");
    const user = { fullName: req.session.userName }; // Add user data here
    res.render("savings", { savings: results, user });
  });
});

// View Debts

app.get("/debts", isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const query = `
    SELECT 
      t.transaction_id,
      t.description, 
      t.amount, 
      (t.amount - IFNULL(SUM(tp.amount), 0)) AS balance, 
      t.transaction_date AS date
    FROM transactions t
    LEFT JOIN transactions tp 
      ON t.transaction_id = tp.transaction_id 
      AND tp.type = 'DEBT_PAYMENT'
    WHERE t.user_id = ? AND t.type = 'DEBT'
    GROUP BY t.transaction_id;
  `;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).send("Error fetching debts.");
    console.log(results); // Add this line to log the results
    const user = { fullName: req.session.userName }; // Include user data
    res.render("debts", { debts: results, user });
  });
});

//footer landing page
app.get("/terms", (req, res) => {
  res.render("terms.ejs");
});
app.get("/policy", (req, res) => {
  res.render("policy.ejs");
});
app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});
app.get("/faqs", (req, res) => {
  res.render("faqs.ejs");
});

/* settings */
app.get("/settings", (req, res) => {
  const userName = req.session.userName || "Guest"; // Fallback if undefined
  //const userName = req.session.userName; // Get the userName from session
  res.render("settings.ejs", { userName });
});

/* notifications */
app.get("/notifications", (req, res) => {
  console.log("Session data in /notifications:", req.session); // Debugging log
  const userName = req.session.userName || "Guest"; // Fallback if undefined
  //const userName = req.session.userName; // Get the userName from session
  res.render("notifications.ejs", { userName });
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out.");
    }
    res.redirect("/"); // Redirect to home page after logout
  });
});

// Server
app.listen(3800, () => console.log("Server started on http://localhost:3800"));
