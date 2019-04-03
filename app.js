import Cron from 'cron';
import Chalk from 'chalk';
import Promise from 'bluebird';
import chunk from 'chunk';
import uuid from 'uuid/v4';
import { filter } from 'lodash';

import { SQS } from 'aws-sdk';
import System from './src/systems/system';
import Socket from './src/services/socket/socketClient';
import db from './src/database/knex';

const running = new Set();
const clients = {};
const sqs = new SQS({ region: process.env.AWS_DEFAULT_REGION });


async function sendSQS(raw) {
  console.log('start send message to sqs');

  let data = {
    event: 'RESERVATIONS',
    data: raw,
  };

  let params = {
    QueueUrl: process.env.HAI_QUEUE_URL,
    MessageBody: JSON.stringify(data),
    MessageDeduplicationId: uuid(),
    MessageGroupId: data.event,
  };

  /* return new Promise((resolve, reject) => {
    sqs.sendMessage(params, (err) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
  */
  sqs.sendMessage(params, function (err, response) {
    if (err) {
      console.log(err, err.stack);
    } else {
      console.log(response);
    }
  });
}

// Aysnc Sub-thread sript
async function subThread(ftpId, hotelId, ftpConfig, fileConfig, socket) {
  try {
    const cli = new System(hotelId, ftpConfig, fileConfig);
    let notSortedFileList = await cli.getDir();
    console.log('---not sorted fileList---');
    console.log(notSortedFileList);

    let filterFileList = filter(notSortedFileList, o => !running.has(o.file_name));
    console.log('---filter running fileList---');
    console.log(filterFileList);

    let fileList = filterFileList.sort((file1, file2) => file1.last_modified - file2.last_modified);
    console.log('---sorted fileList---');
    console.log(fileList);

    fileList.forEach((o) => {
      running.add(o.file_name);
    });
    console.log('---lock file---');
    console.log(running);

    // let sqs = new SQS({ region: process.env.AWS_DEFAULT_REGION });
    for (let file of fileList) {
      const res = await cli.getData(file.file_name);
      let chunkRecords = chunk(res, 150);
      let i = 1;
      console.info(JSON.stringify(chunkRecords.length, null, 2), '\n ');
      let uniqueFileId = uuid();
      for (let chunkRecord of chunkRecords) {
        let recordsMessage = {
          meta: {
            id: uniqueFileId,
            chunk_id: uuid(),
            chunk_seq: i++,
            total_record: res.length,
            num_of_records: chunkRecord.length,
            file_name: file.file_name,
            last_modified: file.last_modified,
            hotel_code: chunkRecord[0].reservation.hotel_code,
            hotel_id: hotelId,
          },
          reservations: chunkRecord,
        };
        console.info('chunk_seq: ', JSON.stringify(i, null, 2), '\n ');

        await sendSQS(recordsMessage);
        // socket.send(recordsMessage);
      }
      // TODO deleteFile when deploy or refactor to have states
      // await cli.deleteFile(file.file_name);
      // running.delete(file.file_name);
      // TODO store fileId and the chunkRecords number into redis
    }
  } catch (err) {
    // Error handling
    console.log(
      Chalk.red(new Date().toISOString()
        .replace(/T/, ' ')
        .replace(/\..+/, ''), ':'),
      `[Error] Hotel[${hotelId}] ${err}`,
    );
  } finally {
    await db('integration_ftp')
      .where('id', ftpId)
      .update({ last_connected: db.fn.now() });
  }
}

/**
 *
 */
function resendOrderedMsg() {

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
      let { token } = record;
      // set up socket client
      let socket;
      // if (clients[record.integration_id]) {
      //   socket = clients[record.integration_id];
      // } else {
      //   socket = new Socket(record.integration_id, record.system_code, token);
      //   clients[record.integration_id] = socket;
      // }
      await subThread(
        record.id,
        record.hotel_id,
        JSON.parse(record.ftp_config || '{}'),
        JSON.parse(record.file_config || '{}'),
        socket,
      );
      return record;
    }),
  );
}

// opening console log
console.log(
  Chalk.green(new Date().toISOString()
    .replace(/T/, ' ')
    .replace(/\..+/, ''), ':'),
  '[hotel-integration ftp client start]',
);

run();

// schedule job in every minute
/*
Cron.job('* * * * *', (() => {
  console.log(
    Chalk.blue(new Date().toISOString()
      .replace(/T/, ' ')
      .replace(/\..+/, ''), ':'),
    'Main thread start',
  );
  // start the service
  run();
}))
  .start();
*/
