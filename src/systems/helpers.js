/* eslint-disable import/prefer-default-export */
import { drop, dropRight, reduce } from 'lodash';
import mapObj from 'map-obj';
import dotProp from 'dot-prop';
import crypto from 'crypto';
import dateformat from 'dateformat';

function fieldGroup(key) {
  switch (key) {
    case 'title':
    case 'first_name':
    case 'middle_name':
    case 'last_name':
    case 'gender':
    case 'email':
    case 'dob':
    case 'address1':
    case 'address2':
    case 'city':
    case 'state':
    case 'country_code':
    case 'postal_code':
    case 'phone1':
    case 'phone2':
    case 'company':
    case 'accompanying':
    case 'vip_code':
    case 'vip_status':
    case 'membership_id':
    case 'membership_level':
    case 'membership_type':
    case 'subscribe_status':
    case 'guest_privacy':
    case 'external':
    case 'crs_profile_id':
    case 'language':
    case 'mailing_list':
      return 'guest';
    case 'currency':
    case 'room_rate_amount':
    case 'food_berverages_amount':
    case 'total_room_revenue':
    case 'room_revenue':
    case 'total_price_tax':
      return 'revenue';
    default:
      return 'reservation';
  }
}

function fieldKeyConvert(key) {
  switch (key) {
    case 'departure_date':
    case 'departure_time':
      return 'departure_datetime';
    case 'arrival_date':
    case 'arrival_time':
      return 'arrival_datetime';
    default:
      return key;
  }
}

function fieldValConvert(key, val = '') {
  switch (key) {
    case 'actual_checkin_date':
    case 'actual_checkout_date':
    case 'actual_dep_date':
    case 'booking_date':
    case 'cancel_date':
    case 'insert_date':
    case 'arrival_date':
    case 'departure_date':
      return val !== '' ? dateformat(val, 'yyyy-mm-dd') : '';
    case 'arrival_time':
    case 'departure_time':
      if (val === '') {
        return val;
      }
      return val.match(':').length < 2 ? `${val}:00` : val;
    default:
      return val;
  }
}

function fieldFilter(key) {
  switch (key) {
    default:
      return true;
  }
}

function fieldCombine(key, exist, val) {
  switch (key) {
    case 'arrival_time':
    case 'departure_time':
      return `${exist.trim()} ${val}`;
    case 'departure_date':
    case 'arrival_date':
      return `${val} ${exist.trim()}`;
    default:
      return val;
  }
}

export function parser(raw, header, footer, rdSplit, fdSplit, fieldName) {
  // drop the header, footer column
  return dropRight(
    drop(
      // split to record
      raw.split(rdSplit), header,
    ),
    footer,
  ).map(record => reduce(mapObj(
    // split to field
    Object.assign({}, record.split(fdSplit)),
    // add key name to each element
    (key, val) => [fieldName[key], val],
  ), (res, val, key) => {
    if (fieldFilter(key)) { // filtler the useless field
      dotProp.set(
        res,
        `${fieldGroup(key)}.${fieldKeyConvert(key)}`, // define the parent key & each own key
        fieldCombine( // define the combine field
          key,
          dotProp.get(res, `${fieldGroup(key)}.${fieldKeyConvert(key)}`, ''), // get the exist val from combined field
          fieldValConvert(key, val),
        ),
      );
    }
    return res;
  }, {}));
}

export function checksum(buff, encode = 'utf8') {
  return crypto.createHash('md5').update(buff, encode).digest('hex');
}
