let AWS = require('aws-sdk');
let {
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
  deleteDataByFileId
} = require('../database/sqlite');

let sqs = new AWS.SQS({ region: 'ap-southeast-1' });
let params = {
  QueueUrl: 'https://sqs.ap-southeast-1.amazonaws.com/204328232493/hig_ftp_queue_staging.fifo',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resendOrderedMsg(fileId){

}

async function run() {
  do {
    await sleep(100);
    sqs.receiveMessage(params, (error, data) => {
      if (error) {
        console.log(error);
      }
      if (data.Messages) {
        let msg = JSON.parse(data.Messages[0].Body);
        console.info(JSON.stringify(data, null, 2), '\n ');
        let { id } = msg.data.meta;
        let seq = msg.data.meta.chunk_seq;
        // insertFileChunk(id, seq);

        sqs.deleteMessage({ ReceiptHandle: data.Messages[0].ReceiptHandle, ...params }, () => {
        });
      }
    });
  } while (1);
}

run()
  .catch((e) => {
    console.log(e);
  });
