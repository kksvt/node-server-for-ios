const express = require('express');
const http = require('http');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const DEBUG_USERS = process.env.DEBUG_USERS && process.env.DEBUG_USERS.toLowerCase() === 'true';

const app = express();

app.use(express.json());

const categories = JSON.parse(fs.readFileSync('./data/categories.json'));
const products = JSON.parse(fs.readFileSync('./data/products.json'));
const tmp_db = new Map();

const print_debug_info = (user) => {
    if (!DEBUG_USERS) {
        return;
    }
    
    if (!user) {
        console.error(`User does not exist, even though it should.`);
        return;
    }
    
    console.log(`User: ${user.email}`);
    console.log(`Products: ${JSON.stringify(user.products)}`);
    console.log(`Categories: ${JSON.stringify(user.categories)}`);
};

const json_deep_copy = (data) => {
    return JSON.parse(JSON.stringify(data));
}

app.get('/categories', (_, res) => {
    res.send(categories);
});

app.get('/products', (_, res) => {
    res.send(products);
});

app.post('/register', (req, res) => {
    if (!req.body) {
        return res.status(400).json({message: 'No body'});
    }

    const email = req.body.email;
    const pwd = req.body.pwd;
    if (!email || !pwd || tmp_db.has(email)) {
        return res.status(400).json({message: 'Invalid data'});
    }

    const hash = bcrypt.hashSync(pwd, 12);
    tmp_db.set(email, {
        email: email, 
        pwd: hash, 
        categories: json_deep_copy(categories), 
        products: json_deep_copy(products)}); //default to these, whatever

    const token = jwt.sign({email: email}, JWT_SECRET);
    print_debug_info(tmp_db.get(email));
    return res.status(201).json({token: token});
});

app.post('/login', (req, res) => {
    if (!req.body) {
        return res.status(400).json({message: 'No body'});
    }

    const email = req.body.email;
    const pwd = req.body.pwd;
    if (!email || !pwd) {
        return res.status(400).json({message: 'Invalid data'});
    }

    const user = tmp_db.get(email);
    if (!user || !bcrypt.compareSync(pwd, user.pwd)) {
        return res.status(400).json({message: 'Invalid data'});
    }

    print_debug_info(tmp_db.get(email));
    const token = jwt.sign({email: email}, JWT_SECRET);
    return res.status(201).json({token: token, products: user.products, categories: user.categories});
});

app.use('/auth', (req, res, next) => {
    if (!req.headers || !req.headers.authorization) {
        return res.status(401).json({message: 'You are not logged in.'});
    }

    const token = req.headers.authorization.replace('Bearer ', '');
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({message: 'Failed to authenticate'});
        }
        req.user = tmp_db.get(user.email);
        next();
    });
});

app.get('/auth/check', (req, res) => {
    print_debug_info(req.user);
    return res.status(200).send({message: 'ok'});
});

app.get('/auth/products', (req, res) => {
    return res.status(200).send(req.user.products);
});

app.get('/auth/categories', (req, res) => {
    return res.status(200).send(req.user.categories);
});

//just replace all the products, whatever
app.put('/auth/products', (req, res) => {
    if (!req.body || !req.body.products) {
        return res.status(400).json({message: 'Invalid data'});
    }

    req.user.products = json_deep_copy(req.body.products);
    print_debug_info(req.user);
    return res.status(201).send({message: 'ok'});
});

//same with categories
app.put('/auth/categories', (req, res) => {
    if (!req.body || !req.body.categories) {
        return res.status(400).json({message: 'Invalid data'});
    }

    req.user.categories = json_deep_copy(req.body.categories);
    print_debug_info(req.user);
    return res.status(201).send({message: 'ok'});
});

const httpServer = http.createServer(app);

httpServer.listen(process.env.APP_PORT);