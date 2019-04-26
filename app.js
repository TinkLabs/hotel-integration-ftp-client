import Cron from 'cron';
import Chalk from 'chalk';
import Promise from 'bluebird';
import path from 'path';
import uuid from 'uuid/v4';
import { filter } from 'lodash';
import moment from 'moment';
import System from './src/systems/system';
import Socket from './src/services/socket/socketClient';
import db from './src/database/knex';
import {
  initReorderMessage,
} from './src/database/reorderKnex';
import orderHandler from './src/systems/order-handler';

const running = new Set();
process.env.TZ = 'UAT';
process.env.runtimePath = path.join(__dirname, 'runtime');


async function sendOneFile(cli, file, hotelId, socket) {
  let uniqueFileId = uuid();
  let chunkInfo = await cli.getFileChunkInfo(file.file_name, 150);
  try {
    await initReorderMessage(hotelId, uniqueFileId, chunkInfo.totalChunkCount);
    await cli.chunkFile(chunkInfo, async (chunkRecord, chunkSeq, totalRecordCount) => {
      console.log('[run chunk]', chunkRecord.length, chunkSeq, totalRecordCount);
      let recordsMessage = {
        event: 'RESERVATIONS',
        meta: {
          chunk_id: uuid(),
          total_record: totalRecordCount,
          num_of_records: chunkRecord.length,
          file_name: file.file_name,
          last_modified: moment(file.last_modified * 1000).format('YYYY-MM-DD HH:mm:ss'),
          hotel_code: chunkRecord[0].reservation.hotel_code,
          hotel_id: hotelId,
          reorder: true,
          reorder_chunk_count: chunkInfo.totalChunkCount,
          reorder_unique_id: uniqueFileId,
          reorder_chunk_seq: chunkSeq,
        },
        data: {
          reservations: chunkRecord,
        },
      };
      console.info('[send one file with insert chunk]', 'file_id: ', uniqueFileId, ',chunk_seq: ', JSON.stringify(chunkSeq, null, 2), '\n ');
      console.log('[ emit message] ', 'total:', chunkRecord.length,
        'first reservation:', recordsMessage.data.reservations[0].reservation.reservation_id,
        'last reservation:', recordsMessage.data.reservations[chunkRecord.length - 1].reservation.reservation_id,
        'meta:', JSON.stringify(recordsMessage.meta));
      await socket.send(recordsMessage);
    });
  } catch (e) {
    console.log('[send one file occur error:]', e.message, e.stack);
    throw e;
  } finally {
    await cli.deleteFile(file.file_name);
  }
}

// Async Sub-thread script
async function subThread(ftpId, hotelId, ftpConfig, fileConfig, socket) {
  try {
    const cli = new System(hotelId, ftpConfig, fileConfig);
    let notSortedFileList = await cli.getDir();
    console.log('---not sorted fileList---');
    console.log(notSortedFileList);

    const now = Math.floor(Number(new Date()) / 1000);
    let filterFileList = filter(notSortedFileList, o => (o.last_modified + 60) < now);
    console.log('---filter fileList---');
    console.log(filterFileList);

    let fileList = filterFileList.sort((file1, file2) => file1.last_modified - file2.last_modified);
    console.log('---sorted fileList---');
    console.log(fileList);

    // eslint-disable-next-line no-restricted-syntax
    for (let file of fileList) {
      // eslint-disable-next-line no-await-in-loop
      await sendOneFile(cli, file, hotelId, socket);
    }

    cli.closeFtp();
  } catch (err) {
    console.log(err);
    // Error handling
    console.log(
      Chalk.red(new Date().toISOString()
        .replace(/T/, ' ')
        .replace(/\..+/, ''), ':'),
      `[Error] Hotel[${hotelId}] ${err}`,
    );
  } finally {
    running.delete(ftpId);
    await db('integration_ftp')
      .where('id', ftpId)
      .update({ last_connected: db.fn.now() });
  }
}

// main thread script
async function run() {
  // select the ftp, file setting
  let res = await db('integration_ftp')
    .whereRaw('NOW() >= DATE_ADD(`last_connected`, INTERVAL `time_interval` MINUTE)')
    .leftJoin('integrations', 'integration_ftp.integration_id', 'integrations.id')
    .select('integration_ftp.id', 'integration_id', 'hotel_id', 'system_code', 'ftp_config', 'file_config', 'integrations.config', 'integrations.token');

  await Promise.all(
    res.map(async (record) => {
      let { token } = record;

      if (running.has(record.id)) {
        console.log(`hotel ${record.id} ${JSON.stringify(running)} is running, return`);
        return null;
      }
      running.add(record.id);

      let socket = new Socket(record.integration_id, record.system_code, token);
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
// start query ftp queue to send fifo message
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
})).start();
