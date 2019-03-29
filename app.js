import Cron from 'cron';
import Chalk from 'chalk';
import Promise from 'bluebird';
import chunk from 'chunk';
import uuid from 'uuid/v4';

import System from './src/systems/system';
import Socket from './src/services/socket/socketClient';
import db from './src/database/knex';

// Aysnc Sub-thread sript
async function subThread(ftpId, hotelId, ftpConfig, fileConfig, socket) {
  try {
    const cli = new System(hotelId, ftpConfig, fileConfig);
    let notSorted_fileList = await cli.getDir();
    console.log('---not sorted fileList---');
    console.log(notSorted_fileList);
    let fileList = notSorted_fileList.sort((file1, file2) => {
      return file1.last_modified - file2.last_modified;
    });
    console.log('---sorted fileList---')
    console.log(fileList);

    for (let file of fileList) {
      const res = await cli.getData(file.file_name);
      let chunk_records = chunk(res, 150);
      let i = 0;
      for (let chunk_record of chunk_records) {
        let records_message = {
          meta: {
            chunk_id: uuid(),
            total_record: res.length,
            num_of_records: chunk_record.length,
            file_name: file.file_name,
            last_modified: file.last_modified,
            hotel_code: chunk_record[0].reservation.hotel_code,
            hotel_id: hotelId,
            record_seq: i++
          },
          reservations: chunk_record,
        };
        socket.send(records_message);
      }
      cli.deleteFile(file.file_name);
    }
  } catch (err) {
    // Error handling
    console.log(
      Chalk.red(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
      `[Error] Hotel[${hotelId}] ${err}`,
    );
  } finally {
    await db('integration_ftp')
      .where('id', ftpId)
      .update({ last_connected: db.fn.now() });
  }
}

// main thread sript
async function run() {
  // select the ftp, file setting
  let res = await db('integration_ftp')
    .whereRaw('NOW() >= DATE_ADD(`last_connected`, INTERVAL `time_interval` MINUTE)')
    .leftJoin('integrations', 'integration_ftp.integration_id', 'integrations.id')
    .select('integration_ftp.id', 'integration_id', 'hotel_id', 'system_code', 'ftp_config', 'file_config', 'integrations.config', 'integrations.token');

  await Promise.all(
    res.map(async (record) => {
      let token = record.token;
       // set up socket client
      let socket = new Socket(record.integration_id, record.system_code, token)
      await subThread(
        record.id,
        record.hotel_id,
        JSON.parse(record.ftp_config || '{}'),
        JSON.parse(record.file_config || '{}'),
        socket,
      );
      // close socket after subThread.
      socket.close();
      return record;
    }),
  );
}

// opening console log
console.log(
  Chalk.green(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
  '[hotel-integration ftp client start]',
);

// schedule job in every minute
Cron.job('* * * * *', (() => {
  console.log(
    Chalk.blue(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
    'Main thread start',
  );
  // start the service
  run();
})).start();
