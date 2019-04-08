/* eslint-disable no-await-in-loop */
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import AWS from 'aws-sdk';
import {
  STATUS,
  selectFileChunkByFileIdOrderBySequence,
  updateChunkByFileIdAndSequenceNum,
  updateFileMsgByFileId,
  deleteChunkByFileId,
} from '../database/sqlite';

let sqs = new AWS.SQS({ region: 'ap-southeast-1' });
let params = {
  QueueUrl: 'https://sqs.ap-southeast-1.amazonaws.com/204328232493/hig_ftp_queue_staging.fifo',
};

async function sendToHaiQueue(raw) {
  let data = {
    event: 'RESERVATIONS',
    data: raw,
  };

  let haiQueueParams = {
    QueueUrl: process.env.HAI_QUEUE_URL,
    MessageBody: JSON.stringify(data),
    MessageDeduplicationId: uuid(),
    MessageGroupId: data.event,
  };

  return new Promise((resolve, reject) => {
    sqs.sendMessage(haiQueueParams, (err, response) => {
      if (err) {
        reject(err);
      }
      resolve(response);
    });
  });
}

async function resendOrderedMsg(fileId) {
  let chunks = await selectFileChunkByFileIdOrderBySequence(fileId);
  for (let chunk of chunks) {
    console.info('[start send chunk message]', JSON.stringify(chunk.sequence_num, null, 2), '\n ');
    let raw = JSON.parse(chunk.msg);
    let sequenceNum = chunk.sequence_num;
    await sendToHaiQueue(raw);
    await updateChunkByFileIdAndSequenceNum(fileId, sequenceNum, STATUS.SEND_FINISH);
  }
}

export default function startHandle() {
  setInterval(() => {
    sqs.receiveMessage(params, async (error, data) => {
      if (error) {
        console.log(`[receive message from ${params.QueueUrl} error]`, error);
      }
      if (data.Messages) {
        let msg = JSON.parse(data.Messages[0].Body);
        console.info(JSON.stringify(data, null, 2), '\n ');
        let fileId = msg.data;
        console.info('[start send file with fileId: ] ', JSON.stringify(fileId, null, 2), '\n ');
        try {
          await resendOrderedMsg(fileId);
        } catch (e) {
          console.info('[resend ordered message error]', JSON.stringify(e.message, null, 2), '\n ');
        }

        sqs.deleteMessage({
          ReceiptHandle: data.Messages[0].ReceiptHandle,
          QueueUrl: process.env.HAI_FTP_URL,
        }, (err, resp) => {
          if (err) {
            console.info('[delete message from queue error]', JSON.stringify(err.message, null, 2), '\n ');
          }
          console.info('[successful send file with fileId: ] ',
            JSON.stringify(fileId, null, 2), '\n ', JSON.stringify(resp, null, 2));
          deleteChunkByFileId(fileId);
          updateFileMsgByFileId(fileId, STATUS.SEND_FINISH);
        });
      }
    });
  }, 1000);
}
