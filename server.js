const express = require('express');
const cors = require('cors');
const app = express();
const sqlite3 = require('sqlite3').verbose();

const constants = require('./backendConstants');
const db_path = constants.dbPath;

const { requestLogger, errorLogger } = require('./loggerMiddleware');
const logger = require('./logger');

app.use(cors())
app.use(express.json());
app.use(requestLogger);
app.use(errorLogger);

const db = new sqlite3.Database(db_path);

// Login and signup APIs

app.post('/signup', (req, res) => {

    logger.info("Signup request for user with request");

    userData = req.body;
    const insertQuery = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;

    db.run(insertQuery, [userData.name, userData.email, userData.password], function (err) {
        if (err) {
            logger.error(err.message);
        } else {
            logger.info(`A row has been inserted with rowId ${this.lastID}`);
            return res.send({ status: 200, message: `User has been signed up with id ${this.lastID}` });
        }
    });
});

app.use('/login', (req, res) => {
    logger.info("Received request for login v1");
    if (!req.body || !req.body.email || !req.body.password) {
        logger.error("Missing email or password while logging in");
        return res.status(401).send({ error: 'Missing email or password' });
    }

    let errorMessage = "";
    let responseToSend = {};

    const query = `SELECT * FROM users WHERE email = ?`;
    db.all(query, [req.body.email], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Something went wrong at the server end' });
        }
        if (rows.length > 0) {
            // User with the provided email exists
            logger.info("User with the provided email exists");
            const user = rows[0];
            logger.info("Validating password for the user");
            // Compare the retrieved password with the input password
            if (user.password === req.body.password) {
                // Passwords match, login successful
                logger.info("Validation successful, generating token");
                let token = Math.random().toString(36).substr(-8);
                logger.info('Login successful');
                responseToSend = {
                    token: token,
                    name: user.name,
                    id: user.id
                };
                return res.status(200).send(responseToSend);
            } else {
                // Passwords do not match
                errorMessage = "Invalid password";
            }
        } else {
            // User with the provided email does not exist
            errorMessage = "Invalid email";
        }
        logger.error(errorMessage);
        return res.status(401).send({ error: errorMessage });
    });

});

// Friend related APIs

app.post('/addFriend', (req, res) => {
    logger.info("Received request for adding friend");
    const userId = req.body.userId;
    const friendId = req.body.friendId;

    if (!userId || !friendId) {
        logger.error("Missing data (userId OR friendId");
        return res.status(401).send({ message: "Missing data", result: "failure" })
    }

    if (userId == friendId) {
        logger.error("You cannot add yourself as a friend");
        return res.status(400).json({ message: 'You cannot add yourself as a friend.', result: "failure" });
    }

    // Check if friend already exists
    const selectQuery = `SELECT id from friends where userId = ? and friendId = ?`;

    db.get(selectQuery, [userId, friendId], (err, row) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ message: 'Internal Server Error', result: "failure" });
        }
        if (row) {
            logger.error("You are already friends");
            return res.status(400).json({ message: 'You are already friends', result: "failure" });
        }

        const query = `INSERT INTO friends (userId, friendId) VALUES (?, ?)`;
        db.run(query, [userId, friendId], function (err) {
            if (err) {
                logger.error('Error executing query: ' + err.message);
                return res.status(500).send({ message: 'Error adding friend', result: 'failure' });
            }
            logger.info("Friend added successfully");
            return res.json({ status: 200, message: 'Friend added successfully', result: 'success' });
        });
    });
});

app.post('/removeFriend', (req, res) => {
    logger.info("Received request for removing friend");
    const { userId, friendId } = req.body;

    if (!userId || !friendId) {
        logger.error("Missing data");
        return res.status(401).send({ message: "Missing data", result: "failure" })
    }

    if (userId == friendId) {
        logger.error("You cannot remove yourself");
        return res.status(400).json({ message: 'You cannot remove yourself.', result: "failure" });
    }

    // Check if friend already exists
    const selectQuery = `SELECT id from friends where userId = ? and friendId = ?`;

    logger.info("Doing validation before remove friend");
    db.get(selectQuery, [userId, friendId], (err, row) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ message: 'Internal Server Error', result: "failure" });
        }
        if (!row) {
            logger.error('You are not friends');
            return res.status(400).json({ message: 'You are not friends', result: "failure" });
        }

        logger.info("Trying to remove friend");
        const deleteQuery = `DELETE FROM friends WHERE userId = ? AND friendId = ?`;
        db.run(deleteQuery, [userId, friendId], (err) => {
            if (err) {
                logger.error('Error executing query: ' + err.message);
                return res.status(500).send({ message: 'Error removing friend', result: 'failure' });
            }
            logger.info("Friend removed successfully");
            return res.json({ message: 'Friend removed successfully', result: 'success' });
        });
    });
});

app.post('/getFriends', (req, res) => {
    logger.info("Received request for getting friends");
    const { userId } = req.body;

    const query = `SELECT u.id, u.name, u.email
                   FROM users u
                   JOIN friends f ON u.id = f.friendId
                   WHERE f.userId = ?`;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            logger.error('Error executing query: ' + err.message);
            return res.status(500).send('Error fetching friends');
        }
        logger.info("Got the list of friends, returning it in response");
        return res.json(rows);
    });
});

app.get('/searchFriendById', (req, res) => {
    logger.info("Received request for searching friend");
    const id = req.body.id;

    try {
        logger.info("Searching for the friend with id: " + id);
        db.all('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {
            if (err) {
                logger.error(err.message);
                res.status(500).send('Error executing query: ' + err.message);
            }
            logger.info("Friend found");
            return res.status(200).json(rows[0]);
        });
    } catch (err) {
        logger.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/searchFriendByName', (req, res) => {
    logger.info("Received request for searching friend by name");
    const name = req.body.name;
    try {
        const searchQuery = "SELECT * FROM users WHERE name like '%" + name + "%'";
        db.all(searchQuery, (err, rows) => {
            if (err) {
                logger.error(err.message);
                res.status(500).send('Error executing query: ' + err.message);
            }
            if (rows.length > 0) {
                logger.info("Friend found");
                return res.status(200).json(rows);
            }
        });
    } catch (err) {
        logger.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Category and Tags related APIs

app.get('/getCategories', (req, res) => {
    logger.info("Received request for getting categories");

    const categories = [];

    const query = `SELECT * FROM tags`;
    db.all(query, (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Something went wrong at the server end' });
        }
        if (rows.length > 0) {
            logger.info("Got categories from DB, preparing response");
            rows.forEach(row => {
                categories.push({ id: row.id, name: row.name });
            });
            logger.info("Returning getCategories response: " + categories);
            return res.status(200).send({
                categories: categories
            });
        }
    });
});

app.post('/addCategory', (req, res) => {
    logger.info("Received request for adding category");
    const categoryName = req.body.categoryName;
    try {
        logger.info("Trying to add a new category");
        const insertQuery = "INSERT INTO tags (name) VALUES ( '" + categoryName + "')";
        db.run(insertQuery, (err) => {
            if (err) {
                logger.error("Could not add a category: " + err.message);
                res.status(500).send({ error: err.message });
            }
            logger.info("Category" + categoryName + " added successfully");
            return res.status(200).send({
                categoryName: categoryName, message: "Category added successfully"
            });
        });
    } catch (err) {
        logger.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Groups related APIs

app.post('/addGroup', (req, res) => {
    logger.info("Received request for adding group");
    const { userId, groupName, members } = req.body;

    if (!members.includes(userId)) {
        members.push(userId);
    }

    logger.info("Validating and removing duplicate entries from group members if present");
    let uniqueMembers = [...new Set(members)];

    const addGroupQuery = `INSERT INTO groups (name, userIds) VALUES (?, ?)`;
    logger.info("Trying to add a new group with name: " + groupName);

    db.run(addGroupQuery, [groupName, uniqueMembers.join(',')], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        logger.info("Group " + groupName + " added successfully");
        res.status(200).json({ message: 'Group added successfully', groupId: this.lastID });
    });
});

app.delete('/deleteGroup', (req, res) => {
    logger.info("Received delete request for the group");
    const groupId = req.body.groupId;

    // Assuming 'groups' table has column 'id'
    const deleteGroupQuery = `DELETE FROM groups WHERE id = ?`;
    logger.info("Trying to delete the group");
    db.run(deleteGroupQuery, [groupId], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (this.changes === 0) {
            logger.error("Requested group to delete does not exist");
            return res.status(404).json({ error: 'Group not found' });
        }

        logger.info("Group deleted successfully");
        res.json({ message: 'Group deleted successfully' });
    });
});

app.post('/groups', (req, res) => {

    logger.info("Received request for getting all available groups for the user");
    const { userId } = req.body;

    const getGroupsQuery = 'SELECT * FROM groups';
    logger.info("Getting all available groups from database");

    db.all(getGroupsQuery, [], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Filtering the groups from all groups based on the user ID");
        const filteredGroups = rows.filter((group) => {
            const userIdsArray = group.userIds.split(',').map((id) => parseInt(id.trim()));
            return userIdsArray.includes(parseInt(userId));
        });

        logger.info("Filtered the group in which the logged in user is present");
        res.json({ groups: filteredGroups });
    });
});

app.post('/groups/users', (req, res) => {
    logger.info("Received request for getting users from a group");
    const groupId = req.body.groupId;

    const getGroupUsersQuery = `SELECT userIds FROM groups WHERE id = ?`;

    logger.info("Trying to get all users from the given group");
    db.get(getGroupUsersQuery, [groupId], (err, row) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (!row) {
            logger.error("Group not found present");
            return res.status(404).json({ error: 'Group not found' });
        }

        const userIds = row.userIds.split(',').map(id => parseInt(id));

        const getUsersQuery = `SELECT email, name, id FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`;

        logger.info("Getting user details for all the users from the group");
        db.all(getUsersQuery, userIds, (err, rows) => {
            if (err) {
                logger.error(err.message);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logger.info("Got the user details and returning users from the given group");
            res.json({ users: rows });
        });
    });
});

app.get('/searchGroupByName', (req, res) => {
    logger.info("Received request for searching group by name");
    const groupName = req.body.name;

    // Assuming 'groups' table has columns 'id' and 'name'
    const searchGroupQuery = `SELECT id, name, userIds FROM groups WHERE name LIKE '%' || ? || '%'`;

    logger.info("Searching group by name in the database");
    db.all(searchGroupQuery, [groupName], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Got the group, returning response");
        res.json({ groups: rows });
    });
});

// Expense related APIs

app.get('/getExpenseById', (req, res) => {
    logger.info("Received request for getting expense by Id");
    const expenseId = req.body.id;

    const getExpenseQuery = 'SELECT * FROM expenses WHERE id = ?';
    logger.info("Fetching the expenses details from id");
    db.get(getExpenseQuery, [expenseId], (err, row) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (!row) {
            logger.error("Expense with the given id does not exist");
            return res.status(404).json({ error: 'Expense not found' });
        }

        logger.info("Expense fetched successfully, sending response");
        res.json({ expense: row });
    });
});

app.post('/getAllExpensesForUser', (req, res) => {
    logger.info("Received request for getting all expenses for the user");
    const userId = req.body.userId;

    const getExpenseQuery = 'SELECT * FROM expenses WHERE userId = ?';
    logger.info("Fetching the expenses details from id");
    db.all(getExpenseQuery, [userId], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Expense fetched successfully, sending response");
        res.json({ expenses: rows });
    });
});

app.post('/addExpense', (req, res) => {
    logger.info("Received request for adding expense");
    const { userId, friendId, categoryId, amount, description, date, paidBy } = req.body;

    const addExpenseQuery = 'INSERT INTO expenses (userId, friendId, categoryId, amount, description, date, paidBy) VALUES (?, ?, ?, ?, ?, ?, ?)';
    logger.info("Adding expense");
    db.run(addExpenseQuery, [userId, friendId, categoryId, amount, description, date, paidBy], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Expense added successfully");
        res.status(201).json({ message: 'Expense added successfully', expenseId: this.lastID });
    });
});

app.delete('/deleteExpense', (req, res) => {
    logger.info("Received request for deleting expense");
    const expenseId = req.body.id;

    const deleteExpenseQuery = 'DELETE FROM expenses WHERE id = ?';
    logger.info("Deleting expense from DB");
    db.run(deleteExpenseQuery, [expenseId], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (this.changes === 0) {
            logger.error("Expense not found");
            return res.status(404).json({ error: 'Expense not found' });
        }

        logger.info('Expense deleted successfully');
        res.json({ message: 'Expense deleted successfully' });
    });
});

app.put('/editExpense', (req, res) => {
    logger.info("Received request for editing expense");
    const { id, userId, friendId, categoryId, amount, description, date } = req.body;

    const editExpenseQuery = 'UPDATE expenses SET userId = ?, friendId = ?, categoryId = ?, amount = ?, description = ?, date = ? WHERE id = ?';
    logger.info("Updating expense details in DB");
    db.run(editExpenseQuery, [userId, friendId, categoryId, amount, description, date, id], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (this.changes === 0) {
            logger.error("Expense not found in DB");
            return res.status(404).json({ error: 'Expense not found' });
        }

        logger.info("Expense updated successfully in DB");
        res.json({ message: 'Expense updated successfully' });
    });
});

app.get('/getExpensesByDate', (req, res) => {
    logger.info("Received request for getting expense by date");
    const { startDate, endDate } = req.body;

    const getExpensesQuery = 'SELECT * FROM expenses WHERE date BETWEEN ? AND ?';
    logger.info("Fetching expense by date from DB");
    db.all(getExpensesQuery, [startDate, endDate], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Fetched  expenses by date from DB");
        res.json({ expenses: rows });
    });
});

app.post('/getExpensesByFriend', (req, res) => {
    logger.info("Received request for getting expense by friend");
    const userId = req.body.userId;
    const friendId = req.body.friendId;

    const getExpenseByFriendIdQuery = `
        SELECT expenses.id, expenses.userId, expenses.categoryId, expenses.friendId, expenses.amount, expenses.description, expenses.date, expenses.paidBy, tags.name AS categoryName
        FROM expenses
        JOIN tags ON expenses.categoryId = tags.id
        WHERE userId = ? AND friendId = ?`;

    logger.info("Fetching expenses from the database using friend id and user");
    db.all(getExpenseByFriendIdQuery, [userId, friendId], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        logger.info("Fetched expenses for the friend, returning response");
        res.json({ expenses: rows });
    });
});


// Shared expenses (Group expense) related APIs

app.post('/getSharedExpenseById', (req, res) => {
    logger.info("Received request for getting shared expenses by ID ");

    const id = req.body.id;
    const query = 'SELECT * FROM shared_expenses WHERE id = ?';
    logger.info("Trying to get shared expense by ID");
    db.get(query, [id], (err, row) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        if (!row) {
            logger.error("Shared expenses not found");
            return res.status(404).send({ error: 'Shared Expense not found' });
        }
        logger.info("Shared expense found, returning response");
        res.send(row);
    });
});

app.post('/addSharedExpense', (req, res) => {
    logger.info("Received request for adding shared expenses ");
    const { groupId, amount, description, date, categoryId, paidBy } = req.body;
    const query = 'INSERT INTO shared_expenses (groupId, amount, description, date, categoryId, paidBy) VALUES (?, ?, ?, ?, ?, ?)';
    logger.info("Adding a record for shared expense in DB");
    db.run(query, [groupId, amount, description, date, categoryId, paidBy], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        logger.info("Shared expense is added successfully");
        res.status(201).send({ message: 'Shared Expense added successfully', id: this.lastID });
    });
});

app.delete('/deleteSharedExpense', (req, res) => {
    logger.info("Received request for deleting shared expense ");
    const id = req.body.id;
    const query = 'DELETE FROM shared_expenses WHERE id = ?';
    logger.info("Removing shared expense from DB");
    db.run(query, [id], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        if (this.changes === 0) {
            logger.error("Shared expense does not exist");
            return res.status(404).send({ error: 'Shared Expense not found' });
        }
        logger.info("Shared expense deleted successfully");
        res.send({ message: 'Shared Expense deleted successfully' });
    });
});

app.put('/editSharedExpense', (req, res) => {
    logger.info("Received request for editing shared expenses ");
    const id = req.body.id;
    const { groupId, amount, description, date } = req.body;
    const query = 'UPDATE shared_expenses SET groupId = ?, amount = ?, description = ?, date = ? WHERE id = ?';
    logger.info("Updating shared expense in DB");
    db.run(query, [groupId, amount, description, date, id], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        if (this.changes === 0) {
            logger.error("Shared expense does not exist");
            return res.status(404).send({ error: 'Shared Expense not found' });
        }
        logger.info("Shared expense updated successfully");
        res.send({ message: 'Shared Expense updated successfully' });
    });
});

app.post('/getSharedExpensesByDate', (req, res) => {
    logger.info("Received request for getting shared expenses by date");
    const { startDate, endDate } = req.body;
    const query = 'SELECT * FROM shared_expenses WHERE date BETWEEN ? AND ?';
    logger.info("Fetching shared expense for a date range");
    db.all(query, [startDate, endDate], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        logger.info("Got shared expense for a date range, returning response");
        res.send(rows);
    });
});

app.post('/getSharedExpensesByGroupId', (req, res) => {
    logger.info("Received request for getting shared expenses by Group Id");
    const groupId = req.body.groupId;
    const query = `
        SELECT e.id, e.groupId, e.amount, e.description, e.date, t.name as categoryName, u.name as paidByName
        FROM shared_expenses e
        JOIN users u ON e.paidBy = u.id
        JOIN tags t ON e.categoryId = t.id
        WHERE e.groupId = ?`;

    logger.info("Getting shared expense for a group");
    db.all(query, [groupId], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        logger.info("Got shared expense for the group");
        res.send({ expenses: rows });
    });
});


// Settled expenses related APIs

// Add settled expense
app.post('/addSettledExpense', (req, res) => {
    logger.info("Received request for adding settled expense");
    const { userId, friendId, amount, categoryId, description, date } = req.body;
    const settledOnDate = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

    const addSettledExpenseQuery = 'INSERT INTO settled_expense (userId, friendId, amount, categoryId, description, date, settledOn) VALUES (?, ?, ?, ?, ?, ?, ?)';
    logger.info("Adding settled expense in the DB");
    db.run(addSettledExpenseQuery, [userId, friendId, amount, categoryId, description, date, settledOnDate], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Settled expense added successfully in DB");
        res.json({ message: 'Settled expense added successfully', id: this.lastID });
    });
});

// Settle all expenses between a user and a friend
app.post('/settleAllExpenses', (req, res) => {
    logger.info("Received request for settling all expense");
    const { userId, friendId } = req.body;

    const getExpensesQuery = 'SELECT * FROM expenses WHERE userId = ? AND friendId = ?';
    logger.info("Adding a record for expense in settled expenses");
    db.all(getExpensesQuery, [userId, friendId], async (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Insert settled expenses into settled_expense table
        const insertSettledExpenseQuery = 'INSERT INTO settled_expense (userId, friendId, amount, categoryId, description, date) VALUES (?, ?, ?, ?, ?, ?)';
        logger.info("Adding expense in settled expenses table");
        for (const expense of rows) {
            const { userId, friendId, amount, categoryId, description, date } = expense;
            db.run(insertSettledExpenseQuery, [userId, friendId, amount, categoryId, description, date], (err) => {
                if (err) {
                    logger.error(err.message);
                }
            });
        }
        logger.info("Added record in settled expenses table");

        // Delete settled expenses from expenses table
        const deleteExpensesQuery = 'DELETE FROM expenses WHERE userId = ? AND friendId = ?';
        logger.info("Removing settled expense from the expense table");
        db.run(deleteExpensesQuery, [userId, friendId], (err) => {
            if (err) {
                logger.error(err.message);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            logger.info("Expense settled successfully");
            res.status(200).json({ message: 'Expenses settled successfully' });
        });
    });
});

// Get all settled expenses between a user and a friend with category name from tags table
app.post('/getSettledExpensesBetween', (req, res) => {
    logger.info("Received request for getting settled expense between users");
    const { userId, friendId } = req.body;

    const getSettledExpensesQuery = `
        SELECT s.id, s.userId, s.friendId, s.amount, t.name AS categoryName, s.description, s.date, s.settledOn
        FROM settled_expense s
        INNER JOIN tags t ON s.categoryId = t.id
        WHERE s.userId = ? AND s.friendId = ?
    `;

    logger.info("Getting all the settled expenses between friends");
    db.all(getSettledExpensesQuery, [userId, friendId], (err, rows) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Got the settled expenses");
        res.json({ settledExpenses: rows });
    });
});

app.post('/deleteSettledExpense', (req, res) => {
    logger.info("Received request for deleting settled expense");
    const expenseId = req.body.expenseId;

    const deleteSettledExpenseQuery = 'DELETE FROM settled_expense WHERE id = ?';
    logger.info("Deleting settled expense from DB");
    db.run(deleteSettledExpenseQuery, [expenseId], (err) => {
        if (err) {
            logger.error(err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        logger.info("Settled expense is removed from DB");
        res.json({ message: 'Settled expense deleted successfully' });
    });
});


// Getting all users related APIs

app.get('/getAllUsers', (req, res) => {
    logger.info("Received request for getting all users");
    const getAllUsersQuery = 'SELECT id, name, email FROM users';
    logger.info("Fetching all the users from DB");
    db.all(getAllUsersQuery, [], (err, rows) => {
        if (err) {
            logger.error('Error executing query: ' + err.message);
            return res.status(500).send('Error fetching users');
        }
        logger.info("Fetched all the users from DB");
        res.json(rows);
    });
});



// Feedback related API

app.post('/addFeedback', (req, res) => {
    logger.info("Received request for adding a feedback");
    const { email, name, phoneNumber, message } = req.body.formData;
    const timestamp = new Date().toISOString(); // Get current timestamp
    const query = 'INSERT INTO feedback (name, email, message, timestamp, phoneNumber) VALUES (?, ?, ?, ?, ?)';
    logger.info("Adding a feedback into DB for timestamp: " + timestamp);
    db.run(query, [name, email, message, timestamp, phoneNumber], function (err) {
        if (err) {
            logger.error(err.message);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
        logger.info("Feedback added successfully");
        res.status(201).send({ message: 'Feedback added successfully', id: this.lastID });
    });
});


function startServer() {
    var port = process.env.PORT || 8080;
    app.listen(port);
    logger.info("Server started and ready to listen on " + port);
}

startServer();
