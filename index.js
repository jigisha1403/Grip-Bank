import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
app.set('view engine','ejs');

const db = new pg.Client({
    user:"postgres",
    host:"localhost",
    database:"",
    password:"",
    port:5432
});
db.connect();

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static("public"));

app.get("/",function(req,res){
    res.render("home");
})

app.get("/createuser",function(req,res){
    res.render("createuser", {submit:false});
});

app.get("/aboutus",function(req,res){
    res.render("aboutus");
});


app.post("/createuser", function(req, res) {
    const { fname, lname, email, gender, balance } = req.body;
    const query = "INSERT INTO users (fname, lname, email, gender, balance) VALUES ($1, $2, $3, $4, $5)";
    const values = [fname, lname, email, gender, balance];
    
    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error occurred while creating user:', err);
            //res.redirect('/error_page'); // Redirect to an error page
        } else {
            console.log('User created successfully');
            res.redirect('/'); // Redirect to success page
        }
    });
});


app.get('/history', async (req, res) => {
    try {
        const query = `
            SELECT 
                t.id,
                s.fname AS sender_fname,
                s.lname AS sender_lname,
                r.fname AS receiver_fname,
                r.lname AS receiver_lname,
                t.amount,
                t.datetime
            FROM 
                transaction t
            JOIN 
                users s ON t.sender_id = s.id
            JOIN 
                users r ON t.receiver_id = r.id
            ORDER BY 
                t.datetime DESC
        `;
        const result = await db.query(query);
        const transactions = result.rows;

        res.render('history', { transactions: transactions });
    } catch (err) {
        console.error('Error fetching transaction history:', err);
        res.status(500).send('Internal Server Error');
    }
});


 

app.get("/transactions", function(req, res) {
    const query = "SELECT * FROM transaction";
    db.query(query, (err, result) => {
        if (err) {
            console.error('Error fetching transactions: ', err);
            res.status(500).send('Internal server error');
        } else {
            res.render("history", { transactions: result.rows });
        }
    });
}); 


app.get("/money", function(req,res){ 
    const query = "SELECT * FROM users";
    db.query(query, (err , result)=> {
        if(err){
            console.log('Error fetching users: ', err);
            res.status(500).send('Internal Server Error');
        }
        else{
            const users = result.rows;
            console.log('Fetched users: ', users);
            res.render("money", {users : users});
        }
    });
});


app.get('/transfer', async (req, res) => {
    try {
        const userId = req.query.id;
        if (!userId) {
            return res.status(400).send('User ID is required');
        }

        // Fetch sender details
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await db.query(query, [userId]);
        const user = result.rows[0];

        if (!user) {
            return res.status(404).send('Sender not found');
        }

        // Fetch other users for transfer options
        const usersQuery = 'SELECT * FROM users WHERE id != $1';
        const usersResult = await db.query(usersQuery, [userId]);
        const users = usersResult.rows;

        res.render('transfer', { user: user, users: users });
    } catch (err) {
        console.error('Error fetching transfer details:', err);
        res.status(500).send('Internal Server Error');
    }
});
app.post('/transfer', async (req, res) => {
    const { from, to, amount } = req.body;
    console.log('Transfer request:', req.body);

    // Ensure amount is a valid number
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
        return res.status(400).send('Invalid amount');
    }

    try {
        console.log('Fetching sender details for ID:', from);
        const senderQuery = 'SELECT * FROM users WHERE id = $1';
        const senderResult = await db.query(senderQuery, [from]);
        const sender = senderResult.rows[0];

        console.log('Fetching receiver details for ID:', to);
        const receiverQuery = 'SELECT * FROM users WHERE id = $1';
        const receiverResult = await db.query(receiverQuery, [to]);
        const receiver = receiverResult.rows[0];

        if (!sender || !receiver) {
            return res.status(404).send('Sender or Receiver not found');
        }

        const senderBalance = parseFloat(sender.balance);
        console.log('Sender balance:', senderBalance);

        if (senderBalance < transferAmount) {
            return res.status(400).send('Insufficient balance');
        }

        await db.query('BEGIN');

        // Update sender and receiver balances
        console.log(`Updating sender balance. Deducting ${transferAmount}`);
        await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [transferAmount, from]);

        console.log(`Updating receiver balance. Adding ${transferAmount}`);
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [transferAmount, to]);

        // Insert transaction record
        console.log('Inserting transaction record');
        const insertTransactionQuery = 'INSERT INTO transaction (sender_id, receiver_id, amount, datetime) VALUES ($1, $2, $3, NOW())';
        await db.query(insertTransactionQuery, [from, to, transferAmount]);

        await db.query('COMMIT');

        console.log('Transaction successful, redirecting to /history');
        res.redirect('/history'); // Redirect to transaction history page
    } catch (err) {
        console.error('Error handling transfer:', err);
        await db.query('ROLLBACK');
        res.status(500).send('Internal Server Error');
    }
});


app.listen(3000,function(){
    console.log("server started on port 3000");
});