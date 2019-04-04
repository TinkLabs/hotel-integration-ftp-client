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
import {
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  deleteChunkByFileId,
} from './src/database/sqlite';
import orderHandler from './src/systems/order-handler';

const running = new Set();
const clients = {};
const sqs = new SQS({ region: process.env.AWS_DEFAULT_REGION });

/**
 * send the fileId to queue make order-handler can resend fileChunk to hig_hai_queue_[ENV].fifo
 * @param raw
 * @returns {Promise<Bluebird | Bluebird<any>>}
 */
async function sendToFtpQue(raw) {
  console.log('startHandle send message to hig_ftp_queue_staging.fifo sqs');

  let data = {
    event: 'RESERVATIONS',
    data: raw,
  };

  let ftpParams = {
    QueueUrl: process.env.HAI_FTP_URL,
    MessageBody: JSON.stringify(data),
    MessageDeduplicationId: uuid(),
    MessageGroupId: data.event,
  };

  return new Promise((resolve, reject) => {
    sqs.sendMessage(ftpParams, (err, response) => {
      if (err) {
        reject(err);
      }
      resolve(response);
    });
  });
}

async function sendOneFile(cli, file, hotelId) {
  let i = 1;
  let uniqueFileId = uuid();
  let fileMessage = await selectFileMessageByUuid(uniqueFileId);
  if (fileMessage !== undefined && fileMessage.file_id === uniqueFileId) {
    console.info(JSON.stringify(`handling file with id: ${uniqueFileId}`, null, 2), '\n ');
    return;
  }

  try {
    const res = await cli.getData(file.file_name);
    let chunkRecords = chunk(res, 150);
    insertFileMessage(uniqueFileId, chunkRecords.length);

    for (let chunkRecord of chunkRecords) {
      let recordsMessage = {
        meta: {
          id: uniqueFileId,
          chunk_id: uuid(),
          chunk_seq: i,
          total_record: res.length,
          num_of_records: chunkRecord.length,
          file_name: file.file_name,
          last_modified: file.last_modified,
          hotel_code: chunkRecord[0].reservation.hotel_code,
          hotel_id: hotelId,
        },
        reservations: chunkRecord,
      };
      console.info('file_id: ', uniqueFileId, ',chunk_seq: ', JSON.stringify(i - 1, null, 2), '\n ');

      await insertFileChunk(
        uniqueFileId, i - 1, JSON.stringify(recordsMessage),
      );
      i += 1;
      // socket.send(recordsMessage);
    }

    await sendToFtpQue(uniqueFileId);

    await cli.deleteFile(file.file_name);
    running.delete(file.file_name);
  } catch (e) {
    await deleteChunkByFileId(uniqueFileId);
    throw e;
  }
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
      await sendOneFile(cli, file, hotelId);
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
      if (clients[record.integration_id]) {
        socket = clients[record.integration_id];
      } else {
        socket = new Socket(record.integration_id, record.system_code, token);
        clients[record.integration_id] = socket;
      }
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
  '[hotel-integration ftp client startHandle]',
);

orderHandler();

// schedule job in every minute
Cron.job('* * * * *', (() => {
  console.log(
    Chalk.blue(new Date().toISOString()
      .replace(/T/, ' ')
      .replace(/\..+/, ''), ':'),
    'Main thread startHandle',
  );
  // startHandle the service
  run();
}))
  .startHandle();
