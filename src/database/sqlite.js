let sqlite3 = require('sqlite3')
  .verbose();

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run('CREATE TABLE lorem (info TEXT)');

  let stmt = db.prepare('INSERT INTO lorem VALUES (?)');
  for (let i = 0; i < 10; i++) {
    stmt.run(`Ipsum ${i}`);
  }
  stmt.finalize();


});

export default db;
