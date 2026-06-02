const neo4j = require('neo4j-driver');
const config = require('../config');

let driver = null;

function getDriver() {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4j.url,
      neo4j.auth.basic(config.neo4j.username, config.neo4j.password)
    );
  }
  return driver;
}

async function runQuery(cypher, params = {}) {
  const session = getDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map(record => {
      const obj = {};
      record.keys.forEach((key) => {
        const val = record.get(key);
        // Convert Neo4j nodes/relationships to plain objects
        if (val && val.properties !== undefined) {
          obj[key] = {
            ...val.properties,
            _labels: val.labels || [],
            _type: val.type || null,
            _identity: val.identity?.toString?.(),
          };
        } else {
          obj[key] = neo4j.isInt(val) ? val.toNumber() : val;
        }
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = { getDriver, runQuery, closeDriver };
