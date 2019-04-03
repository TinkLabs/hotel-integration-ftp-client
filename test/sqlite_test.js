import sqlite from '../src/database/sqlite';

function run() {
  sqlite.each('SELECT rowid AS id, info FROM lorem', (err, row) => {
    if (err) {
      console.log(err);
    }
    console.log(`${row.id} : ${row.info}`);
  });
}

run();
