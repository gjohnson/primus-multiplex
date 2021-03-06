/**
 * Module dependencies.
 */

var Primus = require('primus');
var Stream = require('stream');

/**
 * Message packets.
 */

var packets = {
  MESSAGE: 2,
  SUBSCRIBE: 3,
  UNSUBSCRIBE: 4
};

/**
 * Module export.
 */

module.exports = Channel;

/**
 * `Channel` constructor.
 *
 * @constructor
 * @param {primus.Spark} spark Primus spark instance instance.
 * @param {String} name The name to subscribe to
 * @param {Object} channels Channels
 * @api public
 */

function Channel (mp, spark, id, name) {
  this.initialise(mp, spark, id, name);
}

/**
 * Inherits from `Stream`.
 */

Channel.prototype.__proto__ = Stream.prototype;

/**
 * initialise channel object.
 *
 * @constructor
 * @param {primus.Spark} spark Primus spark instance instance.
 * @param {String} name The name to subscribe to
 * @param {Object} channels Channels
 * @api public
 */

Channel.prototype.initialise = function (mp, spark, id, name) {
  this.mp = mp;
  this.spark = spark;
  this.id = id;
  this.name = name;
  this.channels = spark.channels;
  return this;
};

/**
 * Send a new message to a given spark.
 *
 * @param {Mixed} data The data that needs to be written.
 * @returns {Boolean} Always returns true.
 * @api public
 */

Channel.prototype.write = function (data) {
  var packet = this.packet(packets.MESSAGE, data);
  return this.spark.write(packet);
};

/**
 * Encode data to return a multiplex packet.
 * @param {Number} type
 * @param {Object} data
 * @return {Object} packet
 * @api private
 */

Channel.prototype.packet = function (type, data) {
  var packet = [type, this.id, this.name];
  if (data) packet.push(data);
  return packet;
};

/**
 * End the connection.
 *
 * @param {Mixed} data Optional closing data.
 * @param {Function} fn Optional callback function.
 * @return {Channel} self
 * @api public
 */

Channel.prototype.end = function (data, fn) {
  var chnl = this, packet;

  if ('function' === typeof data) {
    fn = data;
    data = null;
  }

  if (data) this.write(data);
  if (this.id in this.channels) {
    packet = this.packet(packets.UNSUBSCRIBE);
    this.spark.write(packet);
    delete this.channels[this.id];
    process.nextTick(function () {
      chnl.emit('close');
      if ('function' === typeof fn) fn();
    });
  }
  return this;
};

/**
 * Destroy the channel.
 *
 * @return {Channel} self
 * @api public
 */

Channel.prototype.destroy = function () {
  var chnl = this;
  return chnl.end(function () {
    chnl.removeAllListeners();
  });
};

Channel.packets = packets;
