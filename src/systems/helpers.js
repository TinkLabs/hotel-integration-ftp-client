/* eslint-disable import/prefer-default-export */
import _ from 'lodash';
import mapObj from 'map-obj';
import dotProp from 'dot-prop';
import crypto from 'crypto';
import dateformat from 'dateformat';
import empty from 'is-empty';
import moment from 'moment';

export function parser(raw, header, footer, rdSplit, fdSplit, fieldMapping) {
  
  let records = raw.split(rdSplit);
  records = _.drop(records, header);
  records = _.dropRight(records, footer);
  
  return records.map(record => {
    record = record.split(fdSplit);
    record = mapObj(fieldMapping, (key, value) => {
      return [key, !empty(record[value.column_index]) ? record[value.column_index] : !empty(value.default) ? value.default : null];
    });
    
    let checkin_datetime;
    if(!empty(record.checkin_datetime)){
      checkin_datetime = !empty(record.checkin_datetime) ? moment(record.checkin_datetime, "YYYY-MMM-DD HH:mm").format("YYYY-MM-DD HH:mm:ss") : "";
    }
    let checkin_date = !empty(record.checkin_date) ? record.checkin_date : "";
    let checkin_time = !empty(record.checkin_time) ? record.checkin_time : "00:00";
    checkin_datetime = !empty(record.checkin_date) ? moment(`${record.checkin_date} ${record.checkin_time}`, "YYYY-MMM-DD HH:mm").format("YYYY-MM-DD HH:mm:ss") : "";
    
    let checkout_datetime;
    if(!empty(record.checkout_datetime)){
      checkout_datetime = !empty(record.checkout_datetime) ? moment(record.checkout_datetime, "YYYY-MMM-DD HH:mm").format("YYYY-MM-DD HH:mm:ss") : "";
    }
    let checkout_date = !empty(record.checkout_date) ? record.checkout_date : "";
    let checkout_time = !empty(record.checkout_time) ? record.checkout_time : "00:00";
    checkout_datetime = !empty(record.checkout_date) ? moment(`${record.checkout_date} ${record.checkout_time}`, "YYYY-MMM-DD HH:mm").format("YYYY-MM-DD HH:mm:ss") : "";
    
    let result = {
      reservation: {
        hotel_code: !empty(record.hotel_code) ? record.hotel_code : "",
        reservation_id: !empty(record.reservation_id) ? record.reservation_id : "",
        reservation_status: !empty(record.reservation_status) ? record.reservation_status : "",
        checkin_datetime: checkin_datetime,
        checkout_datetime: checkout_datetime,
        actual_checkin_date: !empty(record.actual_checkin_date) ? moment(record.actual_checkin_date, "YYYY-MMM-DD").format("YYYY-MM-DD") : "",
        actual_checkout_date: !empty(record.actual_checkout_date) ? moment(record.actual_checkout_date, "YYYY-MMM-DD").format("YYYY-MM-DD"): "",
        booking_date: !empty(record.booking_date) ? moment(record.booking_date, "YYYY-MMM-DD").format("YYYY-MM-DD") : "",
        cancel_date: !empty(record.cancel_date) ? moment(record.cancel_date, "YYYY-MMM-DD").format("YYYY-MM-DD") : "",
        cancel_id: !empty(record.cancel_id) ? record.cancel_id : "",
        num_adults: !empty(record.num_adults) ? parseInt(record.num_adults): 0,
        num_children: !empty(record.num_children) ? parseInt(record.num_children) : 0,
        accompanying: !empty(record.accompanying) ? record.accompanying : "",
        room_number: !empty(record.room_number) ? record.room_number : "",
        room_type: !empty(record.room_type) ? record.room_type : "",
        room_class: !empty(record.room_class) ? record.room_class : "",
        room_type_code: !empty(record.room_type_code) ? record.room_type_code: "",
        source_name: !empty(record.source_name) ? record.source_name : "",
        market_code: !empty(record.market_code) ? record.market_code : "",
        travel_agent: !empty(record.travel_agent) ? record.travel_agent : "",
        special: !empty(record.special) ? record.special : "",
        room_rate_code: !empty(record.room_rate_code) ? record.room_rate_code : "",
      },
      guest: {
        title: !empty(record.title) ? record.title: "",
        first_name: !empty(record.first_name) ? record.first_name: "",
        middle_name: !empty(record.middle_name) ? record.middle_name: "",
        last_name: !empty(record.last_name) ? record.last_name: "",
        gender: !empty(record.gender) ? record.gender : "",
        email: !empty(record.email) ? record.email : "",
        dob: !empty(record.dob) ? moment(record.dob, "YYYY-MMM-DD").format("YYYY-MM-DD") : "",
        address1: !empty(record.address1) ? record.address1 : "",
        address2: !empty(record.address2) ? record.address2 : "",
        city: !empty(record.city) ? record.city : "",
        state: !empty(record.state) ? record.state : "",
        country_code: !empty(record.country_code) ? record.country_code : "",
        postal_code: !empty(record.postal_code) ? record.postal_code : "",
        phone1: !empty(record.phone1) ? record.phone1 : "",
        phone2: !empty(record.phone2) ? record.phone2 : "",
        company: !empty(record.company) ? record.company : "",
        vip_code: !empty(record.vip_code) ? record.vip_code : "",
        vip_status: !empty(record.vip_status) ? record.vip_status : "",
        membership_id: !empty(record.membership_id) ? record.membership_id : "",
        membership_level: !empty(record.membership_level) ? record.membership_level : "",
        membership_type: !empty(record.membership_type) ? record.membership_type : "",
        subscribe_status: !empty(record.subscribe_status) ? record.subscribe_status : "",
        guest_privacy: !empty(record.guest_privacy) ? record.guest_privacy : "",
        external: !empty(record.external) ? record.external : "",
        crs_profile_id: !empty(record.crs_profile_id) ? record.crs_profile_id : "",
        language: !empty(record.language) ? record.language : "",
      },
      renvenue: {
        currency: !empty(record.currency) ? record.currency: "",
        room_rate_amount: !empty(record.room_rate_amount) ? parseFloat(record.room_rate_amount): 0,
        food_berverages_amount: !empty(record.food_berverages_amount) ? parseFloat(record.food_berverages_amount): 0,
        total_room_revenue: !empty(record.total_room_revenue) ? parseFloat(record.total_room_revenue): 0,
        room_revenue: !empty(record.room_revenue) ? parseFloat(record.room_revenue): 0,
        total_price_tax: !empty(record.total_price_tax) ? parseFloat(record.total_price_tax): 0,
      }
    }
    return result;
  });
}

export function checksum(buff, encode = 'utf8') {
  return crypto.createHash('md5').update(buff, encode).digest('hex');
}
