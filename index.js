const express = require('express');
const http = require('http');
const fs = require('fs');

require('dotenv').config();

const app = express();

const categories = JSON.parse(fs.readFileSync('./data/categories.json'));
const products = JSON.parse(fs.readFileSync('./data/products.json'));

app.get('/categories', (_, res) => {
    res.send(categories);
});

app.get('/products', (_, res) => {
    res.send(products);
});

const httpServer = http.createServer(app);

httpServer.listen(process.env.APP_PORT);