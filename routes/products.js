// routes/products.js
const express = require('express');
const router = express.Router();

// 获取商品列表
router.get('/', (req, res) => {
  const products = [
    { id: 1, name: 'Laptop', price: 999 },
    { id: 2, name: 'Phone', price: 699 },
    { id: 3, name: 'Headphones', price: 199 }
  ];
  res.json(products);
});

// 创建商品
router.post('/', (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  // In a real app, you would save to database
  const newProduct = { id: Date.now(), name, price };
  res.status(201).json(newProduct);
});

module.exports = router;