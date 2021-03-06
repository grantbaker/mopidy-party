'use strict';

// TODO : add a mopidy service designed for angular, to avoid ugly $scope.$apply()...
angular.module('partyApp', ['ngCookies'])
  .controller('MainController', function($scope, $cookies) {

  // Scope variables

  $scope.message = [];
  $scope.tracks  = [];
  $scope.loading = true;
  $scope.ready   = false;
  $scope.currentState = {
    queue  : false,
    length : 0,
    track  : {
      length : 0,
      name   : 'Nothing playing, add some songs to get the party going!'
    }
  };

  // Initialize

  var mopidy = new Mopidy({
    'callingConvention' : 'by-position-or-by-name'
  });

  // Adding listenners

  mopidy.on('state:online', function () {
    mopidy.playback
    .getCurrentTrack()
    .then(function(track){
      if(track)
        $scope.currentState.track = track;
      return mopidy.playback.getState();
    })
    .then(function(state){
      $scope.currentState.paused = (state === 'paused');
      return mopidy.tracklist.getLength();
    })
    .then(function(length){
      $scope.currentState.length = length;
    })
    .done(function(){
      $scope.ready   = true;
      $scope.loading = false;
      $scope.$apply();
    });
  });
  mopidy.on('event:playbackStateChanged', function(event){
    $scope.currentState.paused = (event.new_state === 'paused');
    $scope.$apply();
  });
  mopidy.on('event:trackPlaybackStarted', function(event){
    $scope.currentState.track = event.tl_track.track;
    $cookies.remove("voted");
    $scope.$apply();
  });
  mopidy.on('event:tracklistChanged', function(){
    mopidy.tracklist.getLength().done(function(length){
      $scope.currentState.length = length;
      $scope.$apply();
      if($scope.currentState.queue) {
        $scope.loadQueue();
      }
    });
  });

  $scope.printDuration = function(track){

    if(!track.length)
      return '';

    var _sum = parseInt(track.length / 1000);
    var _min = parseInt(_sum / 60);
    var _sec = _sum % 60;

    return '(' + _min + ':' + (_sec < 10 ? '0' + _sec : _sec) + ')' ;
  };

  $scope.toggleQueue = function(){
    var _fn = $scope.currentState.queue ? $scope.search : $scope.loadQueue;
    $scope.currentState.queue = !$scope.currentState.queue;
    if(!$scope.currentState.queue && !$scope.searchField) { // We're in search and field is empty
      $scope.loading = true;
    }
    _fn();
  };

  $scope.loadQueue = function(){

    $scope.message = [];
    $scope.loading = true;

    mopidy.tracklist.getTracks(
    ).done(function(res){

      $scope.tracks = res;

      $scope.loading = false;

      $scope.$apply();
    });
  };

  $scope.search = function(){

    if(!$scope.searchField)
      return;

    $scope.message = [];
    $scope.loading = true;

    mopidy.library.search({
      'any' : [$scope.searchField]
    }).done(function(res){

      $scope.loading = false;
      $scope.tracks  = [];

      var _index = 0;
      var _found = true;
      while(_found){
        _found = false;
        for(var i = 0; i < res.length; i++){
          if(res[i].tracks && res[i].tracks[_index] && res[i].tracks[_index].uri.substring(0,4) == 'spot'){

            $scope.tracks.push(res[i].tracks[_index]);
            _found = true;
            mopidy.tracklist.filter({'uri': [res[i].tracks[_index].uri]}).done(function(matches){
                if (matches.length) {
                  for (var i = 0; i < $scope.tracks.length; i++)
                  {
                    if ($scope.tracks[i].uri == matches[0].track.uri)
                      $scope.tracks[i].disabled = true;

                  }
                  $scope.$apply();
                }
            });
          }
        }
        _index++;
      }

      $scope.$apply();
    });
  };

  $scope.addTrack = function(track){
    var previousAdd = $cookies.get('queued')
    console.log(previousAdd)
    if (previousAdd == null){
        track.disabled = true;

        var now = new Date();
        var expire = new Date(now);
        expire.setMinutes(now.getMinutes() + 10)
        // Hardcoded 10 minute cooldown for queueing songs

        $cookies.put("queued", $scope.currentState.track.uri,{
            'expires' : expire
        });

        mopidy.tracklist
        .index()
        .then(function(index){
          return mopidy.tracklist.add({uris: [track.uri]});
        })
        .then(function(){
          // Notify user
          $scope.message = ['success', 'Queued: ' + track.name];
          $scope.$apply();
          return mopidy.tracklist.setConsume([true]);
        })
        .then(function(){
          return mopidy.playback.getState();
        })
        .then(function(state){
          // Get current state
          if(state !== 'stopped')
            return;
          // If stopped, start music NOW!
          return mopidy.playback.play();
        })
        .catch(function(){
          track.disabled = false;
          $scope.message = ['error', 'Unable to add track, please try again...'];
          $scope.$apply();
        })
        .done();
    } else {
        $scope.message = ['error', 'You queued a song within the past 10 minutes. Please wait to queue another.'];
        //$scope.$apply();
    }
  };

  $scope.nextTrack = function(){
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", "/party/vote", false ); // false for synchronous request
    xmlHttp.send( null );
    $scope.message = ['success', xmlHttp.responseText];
    $cookies.put("voted", $scope.currentState.track.uri);
    $scope.$apply();
  };
});
