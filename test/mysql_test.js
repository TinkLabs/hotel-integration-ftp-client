let knex = require('knex');

const connection = knex({
  client: 'mysql2',
  connection: {
    host: 'localhost',
    user: 'root',
    password: 'abc123',
    database: 'backend2',
  },
});

async function run() {
  let raw = await connection('integrations').where('id', 222222).first('*');
  console.log(raw);
}
run();