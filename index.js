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

app.post('/test/wipe', (_, res) => {
    tmp_db.clear();
    return res.status(201).jsoin({message: 'Database cleared'});
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
        if (!req.user) {
            //eh, this is possible
            return res.status(403).json({message: 'Invalid user'});
        }
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

    let new_products = json_deep_copy(req.body.products)

    for (let p of new_products) {
        const match = req.user.products.filter((old_p) => { return old_p.name === p.name; });
        if (match.length < 1) {
            console.log(`Couldnt match product ${p.name} to any old product.`);
            continue;
        }
        if (match[0].quantity !== p.quantity) {
            console.log(`Product ${p.name} is no longer accounted for, because the quantity has changed.`);
            p.isPaid = false;
        }
    }
    
    req.user.products = new_products;
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

app.get('/auth/pay', (req, res) => {
    let total = 0;
    let paid = 0;
    let remaining = 0;

    for (const p of req.user.products) {
        const quantity = Number(p.quantity) || 0;
        const price = (Number(p.price) || 0) * quantity;

        if (!p.isBought) {
            continue;
        }

        total += price;

        if (p.isPaid) {
            paid += price;
            continue;
        }
    }

    remaining = total - paid;
    return res.status(200).json({
        message: "ok", 
        total, remaining, paid
    });
});

app.post('/auth/pay', (req, res) => {
    if (!req.body || !req.body.amount || !req.body.card_id) {
        return res.status(400).json({message: 'Invalid data'});
    }

    let amount = Number(req.body.amount) || 0;
    const card = req.body.card_id;

    if (amount <= 0) {
        return res.status(400).json({message: 'Invalid amount'});
    }

    let total = 0;
    let paid = 0;
    let remaining = 0;

    for (const p of req.user.products) {
        const quantity = Number(p.quantity) || 0;
        const price = (Number(p.price) || 0) * quantity;

        if (!p.isBought) {
            continue;
        }

        total += price;

        if (p.isPaid) {
            continue;
        }

        if (price <= 0) {
            p.isPaid = true; //i guess?
            continue;
        }

        if (amount >= price) {
            p.isPaid = true;
            amount -= price;
            paid += price;
        }
    }

    if (paid <= 0) {
        if (remaining <= 0) {
            return res.status(200).json({message: 'Already paid'});
        }
        return res.status(403).json({ message: 'Invalid payment' });
    }

    remaining = total - paid;
    return res.status(200).json({
        message: "ok", 
        products: req.user.products, 
        total, remaining, paid
    });
});

const httpServer = http.createServer(app);

httpServer.listen(process.env.APP_PORT);