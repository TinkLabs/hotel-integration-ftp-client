import { drop, dropRight } from 'lodash';
import { mapObj } from 'map-obj';

// eslint-disable-next-line import/prefer-default-export
export function parser(dataArray, header, footer, split, fieldName) {
  // drop the header, footer column
  return dropRight(drop(dataArray, header), footer)
    // split string to array
    .map(record => mapObj(
      Object.assign({}, record.split(split)),
      // add key name to each element
      (key, val) => [fieldName[key], val],
    ));
}
