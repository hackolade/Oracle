class Sequence {
  /**
   *@type {string | undefined} 
   */
  cache

  /**
   *@type {string | undefined} 
   */
  cacheValue

  /**
   * @type {string | undefined}
   */
  cycle

  /**
   * @type {boolean}
   */
  ifNotExist

  /**
   * @type {number | undefined}
   */
  increment

  /**
   * @type {number | undefined}
   */
  maxValue

  /**
   * @type {number | undefined}
   */
  minValue

  /**
   * @type {string}
   */
  sequenceName

  /**
   * @type {number | undefined}
   */
  start

  /**
   * @type {boolean}
   */
  session

  /**
   * @type {string | undefined}
   */
  sharing

  /**
   * @type {string | undefined}
   */
  order

  /**
   * @type {string | undefined}
   */
  keep

  /**
   * @type {string | undefined}
   */
  scale

  /**
   * @type {string | undefined}
   */
  scaleExtend

  /**
   * @type {string | undefined}
   */
  shard


  /**
   * @type {string | undefined}
   */
  shardExtend

  /**
   * @type {boolean}
   */
  global
}

module.exports = {
  Sequence,
};
