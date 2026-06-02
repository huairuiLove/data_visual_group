const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    title: 'DataGraphX',
    config: config.graph,
  });
});

module.exports = router;
