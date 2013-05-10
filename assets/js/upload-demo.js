$(function() {
  'use strict';

  var host = window.tusdEndpoint || 'http://master.tus.io';
  host = 'http://localhost:1080';
  console.log("HOST", host);
  var $progress = $('.js_progress');
  var $download = $('.js_download');

  var originalXhrDataInit = $.blueimp.fileupload._initXHRData;
  $.widget('blueimp.fileupload', $.blueimp.fileupload, {
    _getUploadedBytes: function (jqXHR) {
      var offset = jqXHR.getResponseHeader('Offset');
      return parseInt(offset, 10);
    },

    _initXHRData: function (options) {
      var file = options.files[0];
      options.headers = options.headers || {};

      if (options.contentRange) {
        var parts = options.contentRange.split('-');
        parts[0] = parts[0].replace(/bytes\s*/g, '');
        var offset = parseInt(parts[0], 10);
        // substract 1 here, because content-range will always start
        // at the which bytes it is sending, but Offset states, well, the offset
        options.headers['Offset'] = offset === 0 ? offset : offset - 1;
      }

      options.headers['Content-Disposition'] = 'attachment; filename="' +
          encodeURI(file.name) + '"';
      options.contentType = file.type;
      options.data = options.blob || file;

      // Blob reference is not needed anymore, free memory:
      options.blob = null;
    }
  });

  // This is required at the moment to get CORS headers support for Firefox.
  // Based on http://bugs.jquery.com/ticket/10338#comment:13
  // jQuery is not fixing because it's a FF bug.
  // FF is fixing but only as of version 21+ so to support older versions
  // in combination with jQuery 1.4+, we'll need this:
  function fixFirefoxXhrHeaders() {
    var _super = $.ajaxSettings.xhr;
    $.ajaxSetup({
      xhr: function() {
        var xhr = _super();
        var getAllResponseHeaders = xhr.getAllResponseHeaders;

        xhr.getAllResponseHeaders = function() {
          var allHeaders = getAllResponseHeaders.call(xhr);
          if (allHeaders) {
            return allHeaders;
          }

          allHeaders = "";
          var concatHeader = function(i, headerName) {
            if (xhr.getResponseHeader(headerName)) {
              allHeaders += headerName + ": " + xhr.getResponseHeader(headerName) + "\n";
            }
          };

          $(["Cache-Control", "Content-Language", "Content-Type", "Expires", "Last-Modified", "Pragma"]).each(concatHeader);

          // non-simple headers (add more as required)
          $(["Location", "Range", "Offset", "Content-Range"]).each(concatHeader);

          return allHeaders;
        };

        return xhr;
      }
    });
  }
  fixFirefoxXhrHeaders();

  $('#js_upload').fileupload({
      url: host + '/files',
      maxChunkSize: 16 * 1024 * 1024,
      multipart: false,
      add: function(e, data) {
        $('.js_file').hide();
        $('.js_progress').parent().show();
        upload(data);
      },
      fail: function(e, data) {
        setTimeout(function() {
          upload(data);
        }, 1000);
      },
      progress: function(e, data) {
        var progress = (data.loaded / data.total * 100).toFixed(2);
        setProgress(progress);
      },
      done: function(e, data) {
        console.log(arguments);
        success(data);
      }
  });

  function upload(data) {
    var file = data.files[0];
    var localId = fingerprint(file);
    var size = file.size;

    data.url = localStorage.getItem(localId);

    if (!data.url) {
      console.log(host + '/files');
      $.ajax({
        type: 'POST',
        url: host + '/files/',
        headers: {
          'Final-Length': size,
          'Offset': 0,
          'Content-Disposition': 'attachment; filename="' + encodeURI(file.name) + '"'
        },
        success: function(theData, status, jqXHR) {
          var url = jqXHR.getResponseHeader('Location');
          if (!url) {
            throw "Unable to parse Location header to form url";
          }

          localStorage.setItem(localId, url);

          data.url = url;
          data.method = 'PATCH';
          data.submit();
        },
        error: function(xhr, a, b) {
          console.log("ERROR", a, b, xhr);
          setTimeout(function() {
            upload(data);
          }, 1000);
        }
      });
      return;
    }

console.log("HEAD");
    $.ajax({
      type: 'HEAD',
      url: data.url,
      success: function(theData, status, jqXHR) {
        var offset = jqXHR.getResponseHeader('Offset');
        console.log("HEAD SUCCESS", offset);
        if (offset === null) {
          localStorage.removeItem(localId);
          upload(data);
          return;
        }

        var uploadedBytes = parseInt(offset, 10)+1;
        if (uploadedBytes === size) {
          success(data);
          return;
        }

        data.uploadedBytes = uploadedBytes;
        data.method = 'PATCH';
        data.submit();
      },
      error: function(xhr) {
        if (xhr.status === 404) {
          localStorage.removeItem(localId);
          upload(data);
          return;
        }

        console.log('error checking', data.url, 'status', xhr.status);
        setTimeout(function() {
          upload(data);
        }, 1000);
      }
    });
  }

  function fingerprint(file) {
    return 'file-'+file.name+'-'+file.size;
  }

  function setProgress(percentage) {
    $progress.css('width', percentage+'%');
  }

  function success(data) {
    setProgress(100);
    $progress.parent().hide();
    $download.attr('href', data.url);
    $download.show();
    $download.text('Download '+data.files[0].name);
  }
});
