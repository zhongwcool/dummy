// routes/users.js
const express = require('express');
const router = express.Router();

// 获取用户列表
router.get('/', (req, res) => {
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' }
  ];
  res.json(users);
});

// 创建用户
router.post('/', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  // In a real app, you would save to database
  const newUser = { id: Date.now(), name, email };
  res.status(201).json(newUser);
});

// 获取单个用户
router.get('/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  // Simulating database lookup
  if (userId === 1) {
    res.json({ id: 1, name: 'Alice', email: 'alice@example.com' });
  } else if (userId === 2) {
    res.json({ id: 2, name: 'Bob', email: 'bob@example.com' });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

module.exports = router;