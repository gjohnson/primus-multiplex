module.exports = function multiplex(primus) {

  var Stream
    , Emitter
    , asyncMethod
    , packets = {
        MESSAGE: 2,
        SUBSCRIBE: 3,
        UNSUBSCRIBE: 4
      };

  try {
    Stream = require('stream');
  } catch (e) {
    Stream = EventEmitter;
  }

  try {
    asyncMethod = process.nextTick;
  } catch (e) {
    asyncMethod = function (fn) {
      setTimeout(fn, 0);
    };
  }

  try {
    Emitter = require('stream');
  } catch (e) {
    Emitter = EventEmitter;
  }

  /**
   * `Channel` constructor.
   *
   * @constructor
   * @param {primus.Spark} spark Primus spark instance instance.
   * @param {String} name The name to subscribe to
   * @param {Object} channels Channels
   * @api public
   */

  function Channel (spark, id, name) {
    this.spark = spark;
    this.id = id;
    this.name = name;
    this.channels = spark.channels;
    this.bind();
  }

  /**
   * Bind `channel` events.
   *
   * @return {Channel} self.
   * @api private
   */

  Channel.prototype.bind = function () {
    var channel = this;
    this.spark.on('open', function(){
      channel.onopen();
    });
    return this;
  };

  /**
   * Called upon open connection.
   *
   * @return {Channel} self.
   * @api private
   */

  Channel.prototype.onopen = function () {
    var packet = this.packet(packets.SUBSCRIBE);
    this.spark.write(packet);
    return this;
  };

  /**
   * Inherits from `Stream`.
   */

  Channel.prototype.__proto__ = Stream.prototype;

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
   * End the connection to this `channel`.
   *
   * @param {Mixed} data Optional closing data.
   * @return {Channel} self
   * @api public
   */

  Channel.prototype.end = function () {
    var channel = this, packet;
    if (this.id in this.channels) {
      packet = this.packet(packets.UNSUBSCRIBE);
      this.spark.write(packet);
      delete this.channels[this.id];
      asyncMethod(function () {
        channel.emit('close');
      });
    }
    return this;
  };

  /**
   * `Multiplex` constructor.
   *
   * @constructor
   * @param {primus} primus Primus instance.
   * @param {Object} options.
   * @api public
   */

  function Multiplex (primus, options) {
    options = options || {};
    this.primus = primus;
    this.channels = {};
    this.transform();
  }

  /**
   * Transform the incoming messages.
   *
   * @return {Multiplex} self.
   * @api private
   */

  Multiplex.prototype.transform = function () {

    var multiplex = this;

    multiplex.primus.transform('incoming', function (packet) {
      var data = packet.data, id, type, name, channel, payload;
      if (isArray(data)) {
        type = data.shift();
        id = data.shift();
        name = data.shift();
        payload = data.join('');

        if (!(multiplex.channels[id])) return false;

        switch (type) {
          case packets.UNSUBSCRIBE:
            multiplex.onunsubscribe(id);
            break;
          case packets.MESSAGE:
            multiplex.onmessage(id, payload);
            break;
        }
        return false;
      }
      return true;
    });

    // adding channel method to primus instance
    multiplex.primus.channel = function (name) {
      return multiplex.channel(name);
    };

    return this;
  };

  /**
   * Create new `channels`.
   *
   * @param {String} name Channel name.
   * @return {Multiplex} self.
   * @api public
   */

  Multiplex.prototype.channel = function (name) {
    var id = uuid();
    primus.channels = this.channels;
    return this.channels[id] = new Channel(primus, id, escape(name));
  };

  /**
   * Called upon message received.
   *
   * @param {String|Number} id Connection id.
   * @param {Mixin} data The payload to send.
   * @return {Multiplex} self
   * @api private
   */

  Multiplex.prototype.onmessage = function (id, data) {
    var channel = this.channels[id];
    if (channel) channel.emit('data', data);
    return this;
  };

  /**
   * Called upon unsubscribe request.
   *
   * @param {String|Number} id Connection id.
   * @return {Multiplex} self.
   * @api private
   */

  Multiplex.prototype.onunsubscribe = function (id) {
    var channel = this.channels[id];
    if (channel) {
      delete this.channels[id];
      channel.emit('close');
    }
    return this;
  };

  /**
   * uuid counter.
   */

  uuid.ids = 0;

  /**
   * Generate a unique id.
   */

  function uuid() {
    return Date.now() +'$'+ uuid.ids++;
  }

  /**
   * Check if object is an array.
   */

  function isArray (obj) {
    return '[object Array]' === Object.prototype.toString.call(obj);
  }

  return new Multiplex(primus);
};