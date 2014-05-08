// This technical data was produced for the U. S. Government under Contract No. W15P7T-13-C-F600, and
// is subject to the Rights in Technical Data-Noncommercial Items clause at DFARS 252.227-7013 (FEB 2012)

//requires leaflet_helper.js, underscore, jquery, leaflet, log4javascript

var aoi_feature_edit = {};

aoi_feature_edit.options = {
    drawControlLocation: "topleft"
};

aoi_feature_edit.init = function () {

    aoi_feature_edit.drawcontrol = null;
    aoi_feature_edit.featureLayers = [];
    aoi_feature_edit.icons = [];

    // on each feature use feature data to create a pop-up
    function onEachFeature(feature, layer) {
        if (feature.properties) {
            var popupContent;

            popupContent = "Feature #"+feature.properties.id;
            if (feature.properties.template){
                var template = aoi_feature_edit.feature_types[parseInt(feature.properties.template)];
                popupContent += "<br/>"+template.name;
            }
        }
        layer.bindPopup(popupContent);
    }

    _.each(aoi_feature_edit.feature_types, function (ftype) {
        var featureLayer = L.geoJson(null,{
            style: function (ftype) {
                var feature_type = aoi_feature_edit.feature_types[ftype.properties.template];
                if (feature_type && feature_type.hasOwnProperty("style")) {
                    return feature_type.style;
                }
            },
            onEachFeature:onEachFeature
            });
        aoi_feature_edit.featureLayers[ftype.id] = featureLayer;
    });
};

aoi_feature_edit.get_feature_type = function (i) {
    return aoi_feature_edit.feature_types[i] || {style:{"weight": 2, "color": "yellow", "fillColor": "orange", "fillOpacity": .9, "opacity": 1}};
};
aoi_feature_edit.map_resize = function(){
    var toLower = parseInt($('div.navbar-inner').css('height'));
    var newHeight = $(window).height()-toLower;
    $(map).height(newHeight);
    $(map).css('top',toLower+'px');

    $('.navbar-fixed-top').css('margin-bottom', 0);
    $('body').css({'padding-left':0, 'padding-right':0});

};
aoi_feature_edit.map_init = function (map, bounds) {
    var custom_map = aoi_feature_edit.aoi_map_json;
    aoi_feature_edit.map = map;

    var baseLayers = {};
    var layerSwitcher = {};
    //var editableLayers = new L.FeatureGroup();
    // Only layer in here should be base OSM layer
    _.each(aoi_feature_edit.map._layers, function (l) {
        baseLayers["OpenStreetMap"] = l;
    });

    if (custom_map.hasOwnProperty("layers")) {
        _.each(custom_map.layers, function (l) {
            var n = leaflet_helper.layer_conversion(l);
            if (n !== undefined) {
                if (l.isBaseLayer) {
                    baseLayers[l.name] = n;
                    log.info ("Added " + l.name + " as a base layer.")
                } else {
                    layerSwitcher[l.name] = n;
                    log.info ("Added " + l.name + " as a layer.")
                }
            }
        });
    }

    var layercontrol = L.control.layers(baseLayers, layerSwitcher).addTo(aoi_feature_edit.map);


    aoi_feature_edit.addMapControlButtons(aoi_feature_edit.map);


    var aoi_extents = L.geoJson(aoi_feature_edit.aoi_extents_geojson,
        {
            style: leaflet_helper.styles.extentStyle,
            zIndex: 1000
        });
    aoi_extents.addTo(aoi_feature_edit.map);


    //Build a reset button that zooms to the extents of the AOI
    function locateBounds () {
        return aoi_extents.getBounds();
    }
    (new L.Control.ResetView(locateBounds)).addTo(aoi_feature_edit.map);


    // for each feature template, add features to map and layer control
    _.each(aoi_feature_edit.feature_types, function (ftype) {
        var tnum = ftype.id;
        var featuretype = ftype.type;
        var featureCollection = aoi_feature_edit.createFeatureCollection(tnum);

        _.each(aoi_feature_edit.job_features_geojson.features, function (feature) {
            if (feature.properties.template == tnum && feature.geometry.type == featuretype) {
                //TODO: Change icon here depending on feature type, Issue #27
                featureCollection.features.push(feature);
            }
        });

        aoi_feature_edit.featureLayers[tnum].addData(featureCollection);
        aoi_feature_edit.featureLayers[tnum].addTo(aoi_feature_edit.map);
        layercontrol.addOverlay(aoi_feature_edit.featureLayers[tnum], aoi_feature_edit.feature_types[tnum].name);
    });

    // add one for points
//    var pointcollection = _.filter(aoi_feature_edit.job_features_geojson.features, function(feature) {
//         return feature.geometry.type == "Point";
//    });
//
//    if ( pointcollection.length > 0 ) {
//        var fid = aoi_feature_edit.featureLayers.length + 1;
//        var featureCollection = aoi_feature_edit.createFeatureCollection(fid);
//
//        for ( var i = 0; i < pointcollection.length; i++ ) {
//            featureCollection.features.push(pointcollection[i]);
//        }
//
//        aoi_feature_edit.featureLayers[fid] = L.geoJson(featureCollection);
//        aoi_feature_edit.featureLayers[fid].addTo(aoi_feature_edit.map);
//        layercontrol.addOverlay(aoi_feature_edit.featureLayers[fid], "Points");
//    }

    setTimeout(function () {
        aoi_feature_edit.map.fitBounds(aoi_extents.getBounds());
    }, 1);

    var drawnItems = new L.FeatureGroup();
    aoi_feature_edit.map.addLayer(drawnItems);
    aoi_feature_edit.drawnItems = drawnItems;


    aoi_feature_edit.buildDrawingControl();

    map.on('draw:created', function (e) {
        var type = e.layerType;
        var layer = e.layer;

        var geojson = e.layer.toGeoJSON();
        geojson.properties.template = aoi_feature_edit.current_feature_type_id;
        geojson = JSON.stringify(geojson);

        $.ajax({
            type: "POST",
            url: aoi_feature_edit.create_feature_url,
            data: { aoi: aoi_feature_edit.aoi_id,
                geometry: geojson
            },
            success: alert,
            dataType: "json"
        });

        //layer.bindPopup('Feature Created!');
        drawnItems.addLayer(layer);
    });

    //Resize the map
    aoi_feature_edit.map_resize();
    //Resize it on screen resize, but no more than every .3 seconds
    var lazyResize = _.debounce(aoi_feature_edit.map_resize,300);
    $(window).resize(lazyResize);
};

aoi_feature_edit.buildDrawingControl = function(feature_id){

    if (aoi_feature_edit.drawcontrol) {
        //If a current control exists, delete it
        aoi_feature_edit.map.removeControl(aoi_feature_edit.drawcontrol);
    }

    //Find the Feature ID from the drop-down box (or use the one passed in)
    feature_id = feature_id || aoi_feature_edit.current_feature_type_id || 1;
    var feature = aoi_feature_edit.get_feature_type(feature_id);

    //Start building the draw options object
    var drawOptions = { draw:{position: aoi_feature_edit.options.drawControlLocation} };
    drawOptions.edit = {featureGroup: aoi_feature_edit.drawnItems };

    if (feature.type == "Polygon") {
        drawOptions.draw.polygon = {
            title: 'Add a feature Polygon: '+ feature.name || "Polygon",
            allowIntersection: false,
            drawError: {
                color: '#b00b00',
                timeout: 1000
            },
            shapeOptions: feature.style || {borderColor: "black", backgroundColor:"brown"},
            showArea: true
        };
        drawOptions.draw.polyline = false;
        drawOptions.draw.rectangle = false;
        drawOptions.draw.circle = false;
        drawOptions.draw.marker = false;
    } else {
        drawOptions.draw.marker = {
            title: 'Add a feature point: ' + feature.name || "Point"
        };
        drawOptions.draw.polyline = false;
        drawOptions.draw.rectangle = false;
        drawOptions.draw.circle = false;
        drawOptions.draw.polygon = false;
    }

    //Create the drawing objects control
    var drawControl = new L.Control.Draw(drawOptions);
    aoi_feature_edit.map.addControl(drawControl);
    aoi_feature_edit.drawcontrol = drawControl;

};

aoi_feature_edit.addMapControlButtons = function (map) {

    function my_button_onClick() {
        console.log("Button pressed - Mark AOI as complete");
        //TODO: Finish completion login
    }
    var completeButtonOptions = {
      'html': '<a id="aoi-submit" href="#" class="btn btn-success">Mark Complete</a>',  // string
      'onClick': my_button_onClick,  // callback function
      'hideText': false,  // bool
      'maxWidth': 60,  // number
      'doToggle': false,  // bool
      'toggleStatus': false  // bool
    }
    var completeButton = new L.Control.Button(completeButtonOptions).addTo(map);


    var featuresButtonOptions = {
      'html': '<select id="features"></select>',  // string
      'hideText': false,  // bool
      'maxWidth': 60,  // number
      'doToggle': false,  // bool
      'toggleStatus': false  // bool
    }
    var featuresButton = new L.Control.Button(featuresButtonOptions).addTo(map);




    var feature_type_div = "features";
    _.each(aoi_feature_edit.feature_types, function(feature_type){
        aoi_feature_edit.addOptions(feature_type, feature_type_div);
    });

    $("#aoi-submit").click(function(){
         $.ajax({
              type: "POST",
              url: aoi_feature_edit.complete_url,
              dataType: "json",
              success: function(response){
                  geoq.redirect(aoi_feature_edit.complete_redirect_url);
              }
         });
    });

    var $features = $("#features");
    $features.select2();
    aoi_feature_edit.current_feature_type_id = parseInt($features.val());

    $features.on("change", function(e) {
        log.info("Selected feature type: " + e.val + ".");
        aoi_feature_edit.current_feature_type_id = e.val;
        aoi_feature_edit.updateDrawOptions(e.val);
        //aoi_feature_edit.filterDrawConsole();
    });


};


// Changes current features to match the selected style.
aoi_feature_edit.updateDrawOptions = function (i) {
    aoi_feature_edit.drawcontrol.setDrawingOptions({ polygon: { shapeOptions: aoi_feature_edit.feature_types[i].style },
        rectangle: { shapeOptions: aoi_feature_edit.feature_types[i].style}
    });
    aoi_feature_edit.buildDrawingControl(i);
};

aoi_feature_edit.getDrawConsole = function () {

    var geometry_type = null;

    if (aoi_feature_edit.hasOwnProperty("current_feature_type_id")) {
        var feature_id = aoi_feature_edit.current_feature_type_id;
        geometry_type = aoi_feature_edit.feature_types[feature_id].type;
    }

    if (geometry_type) {
        if (geometry_type != "Polygon") {
            var marker = false;
        }
        if (geometry_type === "Point") {
            var polygon = false;
            var rectangle = false;
        }
    }

};

// Filters the draw control to allow acceptable feature types.
aoi_feature_edit.filterDrawConsole = function () {
    var control = aoi_feature_edit.drawcontrol;
    var geometry_type = aoi_feature_edit.feature_types[aoi_feature_edit.current_feature_type_id].type;
    var map = control._map;
    map.removeControl(control);
};

aoi_feature_edit.addOptions = function (feature, div) {
    var t = _.template("<option value='{{id}}'>{{name}}</option>");
    $("#" + div).append(t(feature));
};

aoi_feature_edit.createFeatureCollection = function (id) {
    var featureCollection = {};
    featureCollection.type = "FeatureCollection";
    featureCollection.features = [];
    featureCollection.properties = {};
    featureCollection.properties.id = id;

    return featureCollection;
};