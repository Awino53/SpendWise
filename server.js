const express = require("express");
const app = express();
const mysql = require("mysql");
const bodyParser = require("body-parser");

const bcrypt = require("bcrypt"); // Import bcrypt
const SALT_ROUNDS = 10; // Define the number of salt rounds

const session = require("express-session");
const { error } = require("console");

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
  database: "tired2",
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
    goal_id,
    debt_id,
  } = req.body;

  // Validate type
  if (
    !type ||
    !["EXPENSE", "INCOME", "SAVING", "DEBT_PAYMENT"].includes(type.toUpperCase())
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

  // If it's a saving, include goal_id in the query
  if (type.toUpperCase() === "SAVING" && goal_id) {
    query += ", goal_id";
    params.push(goal_id);
  }

  // If it's a debt payment, include debt_id in the query
  if (debt_id) {
    query += ", debt_id";
    params.push(debt_id);
  }

  query += ") VALUES (?, ?, ?, ?, ?, ?, ?)";

  db.query(query, params, (err) => {
    if (err){
      console.error("error adding transaction:",err);
    return res.status(500).send("Error adding transaction.");
  }
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
 
// Fetch savings and debts for charts
app.get('/chart-data', async (req, res) => {
  const savings = await db.query('SELECT description, amount FROM savings');
  const debts = await db.query(
    `SELECT name, 
            amount AS original_amount, 
            (amount - COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = debts.id), 0)) AS remaining_balance 
     FROM debts`
  );

  res.json({ savings, debts });
});

// Fetch goal-based savings for progress
app.get("/api/savings/goals", isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  /* const query = `
    SELECT 
      t.saving_goal_id,
      sg.name AS goal_name,
      sg.target_amount,
      IFNULL(SUM(t.amount), 0) AS total_saved,
      (sg.target_amount - IFNULL(SUM(t.amount), 0)) AS remaining_target
    FROM saving_goals As sg
    LEFT JOIN transactions t 
        ON sg.saving_goal_id = t.goal_id AND t.type = 'SAVING'
    WHERE sg.user_id = ?
    GROUP BY sg.saving_goal_id;
  `; */
  const query = `
  SELECT 
    saving_goals.saving_goal_id,  
    saving_goals.name AS goal_name,
    saving_goals.target_amount,
    IFNULL(SUM(t.amount), 0) AS total_saved,
    (saving_goals.target_amount - IFNULL(SUM(t.amount), 0)) AS remaining_target
  FROM saving_goals
  LEFT JOIN transactions t 
    ON saving_goals.saving_goal_id = t.goal_id AND t.type = 'SAVING'
  WHERE saving_goals.user_id = ?
  GROUP BY saving_goals.saving_goal_id;
`;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).send("Error fetching goal-based savings.");
    res.json(results);
  });
});

// Fetch summary of savings
app.get("/api/savings/summary", isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const period = req.query.period || "MONTH"; // Default to monthly

  const query = `
    SELECT 
      DATE_FORMAT(t.transaction_date, '%Y-%m') AS period,
      SUM(t.amount) AS total_saved
    FROM transactions  t
    WHERE t.user_id = ? AND t.type = 'SAVING'
    GROUP BY period;
  `;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).send("Error fetching savings summary.");
    res.json(results);
  });
});

// Fetch savings page with goal and monthly savings
app.get('/savings', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const user = { fullName: req.session.userName }; // Add user data
  
  
  // Fetch savings toward goals
  const goalSavingsQuery = `
    SELECT 
      sg.name AS goal_name,
      IFNULL(SUM(t.amount), 0) AS total_saved
    FROM saving_goals sg
    LEFT JOIN transactions t 
        ON sg.saving_goal_id = t.goal_id AND t.type = 'SAVING'
    WHERE sg.user_id = ?
    GROUP BY sg.saving_goal_id;
  `;
  const goalSavings = await db.query(goalSavingsQuery, [userId]);

  // Fetch monthly savings summary
  const monthlySavingsQuery = `
    SELECT 
      DATE_FORMAT(t.transaction_date, '%Y-%m') AS period,
      SUM(t.amount) AS total_saved
    FROM transactions t
    WHERE t.user_id = ? AND t.type = 'SAVING'
    GROUP BY period;
  `;
  const monthlySavings = await db.query(monthlySavingsQuery, [userId]);

  // Fetch actual savings data
  const savingsQuery = `
    SELECT description, amount, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date
    FROM transactions
    WHERE user_id = ? AND type = 'SAVING'
  `;
  //const savings = await db.query(savingsQuery, [userId]);
  //console.log(savings); // Check this output to verify it's an array
  db.query(savingsQuery, [userId], (err, savings) => {
    if (err) {
      console.error('Error fetching individual savings:', err);
      return res.status(500).send('Error fetching savings data');
    }

    // Check if savings is an array and has data
    if (Array.isArray(savings) && savings.length > 0) {
      res.render('savings', {
        savings,
        goalSavings,
        monthlySavings,
        user
      });
    } else {

  res.render('savings', {
    //savings: savings,
    error:'no individual saving data found.',
    goalSavings,
    monthlySavings,
    user // Pass user object to the view
  });
}

 });
 
});


// View Debts
//fetch debts with remaining balance
app.get("/debts", isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const user = { fullName: req.session.userName }; // Add user data
  const query = `
     SELECT 
        t.transaction_id AS id,
        t.description AS name,
        t.amount AS original_amount,
        IFNULL(SUM(tp.amount), 0) AS total_repaid,
        (t.amount - IFNULL(SUM(tp.amount), 0)) AS remaining_balance,
        t.transaction_date
      FROM transactions t
      LEFT JOIN transactions tp 
          ON t.transaction_id = tp.debt_id AND tp.type = 'DEBT_PAYMENT'
      WHERE t.user_id = ? AND t.type = 'DEBT'
      GROUP BY t.transaction_id;
  `;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).send("Error fetching debts.");
    console.log(results); // Add this line to log the results
    //const user = { fullName: req.session.userName }; // Include user data
    res.render("debts", { debts: results, user: user });
  });
});

// Add new debt
app.post('/debts', isAuthenticated, (req, res) => {
  const { name, amount } = req.body;
  const userId = req.session.userId;
  const query = `
    INSERT INTO transactions (user_id, description, amount, type, transaction_date)
    VALUES (?, ?, ?, 'DEBT', NOW())
  `;
  
  db.query(query, [userId, name, amount], (err) => {
    if (err) return res.status(500).send("Error adding debt.");
    res.redirect('/debts');
  });
});

// Edit an existing debt
app.post('/debts/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const { name, amount } = req.body;
  const query = `
    UPDATE transactions
    SET description = ?, amount = ?
    WHERE transaction_id = ? AND type = 'DEBT'
  `;
  
  db.query(query, [name, amount, id], (err) => {
    if (err) return res.status(500).send("Error updating debt.");
    res.redirect('/debts');
  });
});

// Add a debt payment
app.post('/debts/:id/pay', isAuthenticated, (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const query = `
    INSERT INTO transactions (debt_id, amount, type, transaction_date)
    VALUES (?, ?, 'DEBT_PAYMENT', NOW())
  `;
  
  db.query(query, [id, amount], (err) => {
    if (err) return res.status(500).send("Error making payment.");
    res.redirect('/debts');
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
