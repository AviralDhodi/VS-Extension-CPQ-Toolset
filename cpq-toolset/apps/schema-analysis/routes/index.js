const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ 
        message: 'Schema Analysis App',
        status: 'active'
    });
});

module.exports = router;