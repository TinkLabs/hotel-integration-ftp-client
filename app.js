import Cron from 'cron';
import Chalk from 'chalk';
import Promise from 'bluebird';
import System from './src/systems/system';
import Socket from './src/services/socket/socketClient';
import db from './src/database/knex';

// Aysnc Sub-thread sript
async function subThread(ftpId, hotelId, ftpConfig, fileConfig, socket) {
  try {
    const cli = new System(hotelId, ftpConfig, fileConfig);
    const fileList = await cli.getDir();

    await Promise.each(fileList, async (file) => {
      const res = await cli.getData(file);

      if (await socket.send(res)) {
        console.log(
          Chalk.green(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
          `[Send event] Hotel[${hotelId}] ${file}`,
        );
        // delete file on remote side
        await cli.deleteFile(file);
      }
    }).catch((err) => {
      // Error handling
      console.log(
        Chalk.red(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
        `[File Error]Hotel[${hotelId}] ${err}`,
      );
    }).finally(async () => {
      // update the db record
      await db('integration_ftp')
        .where('id', ftpId)
        .update({ last_connected: db.fn.now() });
    });
  } catch (err) {
    // Error handling
    console.log(
      Chalk.red(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''), ':'),
      `[Error] Hotel[${hotelId}] ${err}`,
    );
  }
}

// main thread sript
async function run() {
  // select the ftp, file setting
  let res = await db('integration_ftp')
    .whereRaw('NOW() > DATE_ADD(`last_connected`, INTERVAL `time_interval` MINUTE)')
    .leftJoin('integrations', 'integration_ftp.integration_id', 'integrations.id')
    .select('integration_ftp.id', 'integration_id', 'hotel_id', 'system_code', 'ftp_config', 'file_config');

  await Promise.all(
    res.map(async (record) => {
      await subThread(
        record.id,
        record.hotel_id,
        JSON.parse(record.ftp_config || '{}'),
        JSON.parse(record.file_config || '{}'),
        new Socket(record.integration_id, record.system_code), // set up socket client
      );
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
