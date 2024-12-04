const express = require("express");
const app = express();
const mysql = require("mysql");
const bodyParser = require("body-parser");

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
  database: "App",
});

db.connect((err) => {
  if (err) throw err;
  console.log("MySQL Connected...");
});

// Routes

// Register route
app.get("/register", (req, res) => {
  res.render("register"); // Render the registration form
});

// Handle registration
app.post("/register", (req, res) => {
  const { email, full_name, password, date_of_birth } = req.body;

  if (!email || !full_name || !password) {
    // You can add basic validation here if needed, like checking empty fields
    return res.redirect("/register");
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

    const sql =
      "INSERT INTO users (email, full_name, password, date_of_birth) VALUES (?, ?, ?, ?)";
    db.query(
      sql,
      [email, full_name, password, date_of_birth],
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

// Login route
app.get("/login", (req, res) => {
  res.render("login"); // Render the login form
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check if both email and password are provided
  if (!email || !password) {
    return res.render("login", { error: "Email and password are required." });
  }

  // Proceed with your authentication logic (e.g., check the database)
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      return res.status(500).send("Error during authentication.");
    }

    if (results.length === 0) {
      return res.render("login", { error: "Invalid credentials." });
    }

    const user = results[0];

    // You should hash and compare passwords, but here's a simple check
    if (user.password !== password) {
      return res.render("login", { error: "Invalid credentials." });
    }

    // If authentication is successful, set the session
    req.session.userId = user.user_id;
    req.session.userName = user.full_name; // Store the user's full name in the session

    return res.redirect("/"); // Redirect to homepage
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

/* /* budget overview */
app.get("/transactions", (req, res) => {
  const userId = req.session.userId; // This should now work if the user is logged in

  if (!userId) {
    // If no userId is found, redirect to login page or show an error
    return res.redirect("/login");
  }

  // SQL query to get the user's name
  const userQuery = `
    SELECT full_name FROM users WHERE user_id = ?
  `;

  // SQL query to get budget data
  const budgetQuery = `
    SELECT c.name AS category, 
           COALESCE(SUM(t.amount), 0) AS amount,
           c.category_id
    FROM categories c
    LEFT JOIN transactions t ON c.category_id = t.category_id
    WHERE c.user_id = ?
    GROUP BY c.name, c.category_id;
  `;

  // SQL query to get transactions data (updated to use correct field names)
  const transactionsQuery = `
    SELECT t.transaction_id, t.description, t.amount, t.transaction_date AS date, t.category_id
    FROM transactions t
    WHERE t.category_id IN (
      SELECT category_id FROM categories WHERE user_id = ?
    );
  `;

  // Get the user's full name from the database
  db.query(userQuery, [userId], (err, userResult) => {
    if (err) {
      console.error("Error fetching user data:", err);
      return res.status(500).send("Error fetching user data.");
    }

    const userName = userResult[0]?.full_name || "Guest"; // Use 'Guest' if no name is found

    // Make sure to pass userId as part of the query parameters
    db.query(budgetQuery, [userId], (err, budgetResults) => {
      if (err) {
        console.error("Error fetching budget data:", err);
        return res.status(500).send("Error fetching budget data.");
      }

      db.query(transactionsQuery, [userId], (err, transactionResults) => {
        if (err) {
          console.error("Error fetching transactions:", err);
          return res.status(500).send("Error fetching transactions.");
        }

        // Process the results and map them for rendering
        const budgetStatus = budgetResults.map((category) => ({
          category: category.category,
          amount: category.amount,
          transactions: transactionResults.filter(
            (t) => t.category_id === category.category_id
          ),
        }));

        // Sample notifications
        const notifications = [
          { message: "You have a recurring bill due tomorrow.", type: "bill" },
          { message: "Debt repayment deadline approaching.", type: "debt" },
        ];

        // Render the response, passing the budget data, notifications, and userName to the view
        res.render("transactions", { userName, budgetStatus, notifications });
      });
    });
  });
});

// Edit Transaction Route
app.post("/edit-transaction/:id", (req, res) => {
  const transactionId = req.params.id;
  const { description, amount, date } = req.body;

  const updateQuery = `
    UPDATE transactions
    SET description = ?, amount = ?, transaction_date = ?
    WHERE transaction_id = ?;
  `;

  db.query(updateQuery, [description, amount, date, transactionId], (err, result) => {
    if (err) {
      console.error("Error updating transaction:", err);
      return res.status(500).send("Error updating transaction.");
    }

    res.redirect("/transactions"); // Redirect back to the overview after editing
  });
});

// Delete Transaction Route
app.post("/delete-transaction/:id", (req, res) => {
  const transactionId = req.params.id;

  const deleteQuery = `
    DELETE FROM transactions WHERE transaction_id = ?;
  `;

  db.query(deleteQuery, [transactionId], (err, result) => {
    if (err) {
      console.error("Error deleting transaction:", err);
      return res.status(500).send("Error deleting transaction.");
    }

    res.redirect("/transactions"); // Redirect back to the overview after deletion
  });
});

// Add Transaction Route (if needed)
app.post("/add-transaction", (req, res) => {
  const { description, amount, category_id, transaction_date } = req.body;

  const insertQuery = `
    INSERT INTO transactions (description, amount, category_id, transaction_date, user_id)
    VALUES (?, ?, ?, ?, ?);
  `;

  db.query(insertQuery, [description, amount, category_id, transaction_date, req.session.userId], (err, result) => {
    if (err) {
      console.error("Error adding transaction:", err);
      return res.status(500).send("Error adding transaction.");
    }

    res.redirect("/transactions"); // Redirect to transactions page after adding
  });
});



/* saving goals progress */
app.get("/savings", (req, res) => {
  const userId = 1; // Example user
  const userName = req.session.userName; // Get the userName from session
  const savingsQuery = `SELECT * FROM savings WHERE user_id = ?`;
  const goalsQuery = `
      SELECT sg.name, sg.target_amount, 
      (s.amount / sg.target_amount) * 100 AS progress
      FROM saving_goals sg
      LEFT JOIN savings s ON sg.savings_id = s.savings_id
      WHERE s.user_id = ?`;

  db.query(savingsQuery, [userId], (err, savings) => {
    if (err) {
      console.error("Error fetching savings:", err);
      return res.status(500).send("Error fetching savings data.");
    }

    db.query(goalsQuery, [userId], (err, goals) => {
      if (err) {
        console.error("Error fetching savings goals:", err);
        return res.status(500).send("Error fetching savings goals.");
      }

      res.render("savings", { userName, savings, goals });
    });
  });
});
/* edit saving goals */
app.post("/savings", (req, res) => {
  const { goalName, targetAmount, currentAmount } = req.body;
  const userId = 1; // Example user

  const insertGoalQuery = `
    INSERT INTO saving_goals (name, target_amount, user_id)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      target_amount = VALUES(target_amount);
  `;

  const updateSavingsQuery = `
    INSERT INTO savings (amount, user_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE 
      amount = VALUES(amount);
  `;

  db.query(insertGoalQuery, [goalName, targetAmount, userId], (err, result) => {
    if (err) {
      console.error("Error adding/updating goal:", err);
      return res.status(500).send("Error adding/updating goal.");
    }

    db.query(updateSavingsQuery, [currentAmount, userId], (err) => {
      if (err) {
        console.error("Error updating savings:", err);
        return res.status(500).send("Error updating savings.");
      }
      res.redirect("/savings");
    });
  });
});

/* delete saving goals */
app.post("/savings/delete/:id", (req, res) => {
  const goalId = req.params.id;

  const deleteGoalQuery = "DELETE FROM saving_goals WHERE goal_id = ?;";

  db.query(deleteGoalQuery, [goalId], (err) => {
    if (err) {
      console.error("Error deleting saving goal:", err);
      return res.status(500).send("Error deleting saving goal.");
    }
    res.redirect("/savings");
  });
});

/* debt managment */
 
app.get("/debts", (req, res) => {
  const userId = 1; // Example user ID
  const userName = req.session?.userName || "Guest"; // Get the userName from session
  const debtsQuery = `
       SELECT d.debt_id, d.debt_name, d.total_amount, d.balance, c.name AS category
       FROM debts d
       JOIN categories c ON d.category_id = c.category_id
       WHERE d.user_id = ?;`;
  const categoriesQuery = `
       SELECT category_id, name 
       FROM categories 
       WHERE user_id = ?;`;

  // Fetch debts and categories in parallel
  db.query(debtsQuery, [userId], (err, debts) => {
    if (err) {
      console.error("Error fetching debts:", err);
      return res.status(500).send("Error fetching debts.");
    }

    db.query(categoriesQuery, [userId], (err, categories) => {
      if (err) {
        console.error("Error fetching categories:", err);
        return res.status(500).send("Error fetching categories.");
      }

      // Render the debts page with debts and categories
      res.render("debts", { userName, debts, categories });
    });
  });
});

/* add or edit debt */
app.post("/debts", (req, res) => {
  const { debtName, totalAmount, balance, category } = req.body;
  const userId = 1; // Example user

  const insertDebtQuery = `
    INSERT INTO debts (debt_name, total_amount, balance, category_id, user_id)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      total_amount = VALUES(total_amount),
      balance = VALUES(balance),
      category_id = VALUES(category_id);
  `;

  db.query(
    insertDebtQuery,
    [debtName, totalAmount, balance, category, userId],
    (err) => {
      if (err) {
        console.error("Error adding/updating debt:", err);
        return res.status(500).send("Error adding/updating debt.");
      }
      res.redirect("/debts");
    }
  );
});

/* delete debts */
app.post("/debts/delete/:id", (req, res) => {
  const debtId = req.params.id;

  const deleteQuery = "DELETE FROM debts WHERE debt_id = ?;";

  db.query(deleteQuery, [debtId], (err) => {
    if (err) {
      console.error("Error deleting debt:", err);
      return res.status(500).send("Error deleting debt.");
    }
    res.redirect("/debts");
  });
});


/* notifications */
app.get("/notifications", (req, res) => {
  const notifications = [
    { message: "You have a recurring bill due tomorrow.", type: "bill" },
    { message: "Debt repayment deadline approaching.", type: "debt" },
    { message: 'You are over budget in the "Rent" category.', type: "budget" },
  ];

  res.render("notifications", { notifications });
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
