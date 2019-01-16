import Cron from 'cron';
import Chalk from 'chalk';
import Promise from 'bluebird';
import System from './src/systems/system';
import Socket from './src/services/socket/socketClient';
import db from './src/database/knex';


// Aysnc Sub-thread sript
async function subThread(hotelId, ftpConfig, fileConfig, socket) {
  try {
    const cli = new System(hotelId, ftpConfig, fileConfig);
    const fileList = await cli.getDir();


    await Promise.each(fileList, async (file) => {
      const res = await cli.getData(file);

      if (await socket.send(res)) {
        console.log(Chalk.green(new Date().toISOString(), ': '), `[Send event] Hotel[${hotelId}] ${file}`);
        // await cli.deleteFile(file);
      }

      // update the db record
      await db('integration_ftp')
        .where('hotel_id', hotelId)
        .update({ last_connect: db.fn.now() });
    }).catch((err) => {
      // Error handling
      console.log(Chalk.red(new Date().toISOString(), ':'), `Hotel[${hotelId}]_fileError ${err}`);
    });
  } catch (err) {
    // Error handling
    console.log(Chalk.red(new Date().toISOString(), ':'), `Hotel[${hotelId}] ${err}`);
  }
}

// main thread sript
async function run() {
  // select the ftp, file setting
  let res = await db('integration_ftp')
    .whereRaw('NOW() > DATE_ADD(`last_connect`, INTERVAL `time_interval` MINUTE)')
    .select();

  // set up socket client
  const socket = new Socket('FTP');

  await Promise.all(
    res.map(async (record) => {
      await subThread(
        record.hotel_id,
        JSON.parse(record.ftp_config || '{}'),
        JSON.parse(record.file_config || '{}'),
        socket,
      );
      return record;
    }),
  );
}

// // schedule job in every minute
// Cron.job('* * * * *', (() => {
//   console.log(
//     Chalk.bgBlue(
//       new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
//       '  Main thread start',
//     ),
//   );

//   // start the service
//   run();
// })).start();
run();
