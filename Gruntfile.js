/* Default grunt file configuration */
/* global module */

var collapse = require('bundle-collapser/plugin');


module.exports = function (grunt) {
    // Project configuration
    'use strict';

    // Get or Default environment
    var argEnv = grunt.option('env');
    if (argEnv === 'prod') {
        argEnv = 'prod';
    } else if (argEnv === 'dev') {
        argEnv = 'dev';
    } else if (argEnv === 'local-chrome') {
        argEnv = 'local-chrome';
    } else {
        argEnv = 'local';
    }
    console.log('ENVIRONMENT: ', argEnv);

    // Set environment in config file
    grunt.file.write('src/config/env.json', '{"current":"' + argEnv + '"}');

    try {
        var deployment = grunt.file.readJSON('deployment.json');
    } catch (e) {
        console.log('\n***\n*\n*\n*\n* Create deployment.json file from deployment-sample.json!\n*\n*\n*\n***\n');
    }

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        watch: {
            js: {
                files: ['src/**'],
                tasks: ['browserify', 'strip_code', 'uglify'],
                options: {
                    atBegin: true
                }
            },
            html: {
                files: ['pages/**'],
                tasks: ['copy'],
                options: {
                    atBegin: true
                }
            }
        },
        uglify: {
            my_target: {
                files: {
                    'dist/digitrust.min.js': ['<%= browserify.client.dest %>'],
                    'dist/digitrust-server.min.js': ['<%= browserify.server.dest %>']
                }
            }
        },
        jsdoc: {
            dist: {
                src: ['src/modules/*.js'],
                options: {
                    destination: 'doc'
                }
            }
        },
        browserify: {
            client: {
                options: {
                    debug: false,
                    plugin: [collapse]
                },
                src: ['src/client.js'],
                dest: 'dist/digitrust.js'
            },
            server: {
                options: {
                    debug: false,
                    plugin: [collapse]
                },
                src: ['src/server.js'],
                dest: 'dist/digitrust-server.js'
            },
        },
        strip_code: {
            options: {
                start_comment: '__start-test-code__',
                end_comment: '__end-test-code__'
            },
            src: {
                src: 'dist/*.js'
            }
        },
        karma: {
            integration: {
                configFile: 'karma.conf.js',
                singleRun: true,
                browsers: ['PhantomJS']
            }
        },
        copy: {
            main: {
                cwd: 'pages/',
                src: '**',
                expand: true,
                dest: 'dist/'
            },
            images: {
                src: 'misc/powered_by.png',
                dest: 'dist/powered_by.png'
            }
        },
        environments: {
            options: {
                local_path: 'dist',
                username: deployment.ec2.username,
                privateKey: require('fs').readFileSync(deployment.ec2.privateKeyPath),
                releases_to_keep: '3',
                current_symlink: 'v1',
                debug: true
            },
            dev1: {
                options: {
                    host: deployment.ec2.host1,
                    deploy_path: '/var/www/cdn.digitru.st/dev/'
                }
            },
            dev2: {
                options: {
                    host: deployment.ec2.host2,
                    deploy_path: '/var/www/cdn.digitru.st/dev'
                }
            },
            prod1: {
                options: {
                    host: deployment.ec2.host1,
                    deploy_path: '/var/www/cdn.digitru.st/prod'
                }
            },
            prod2: {
                options: {
                    host: deployment.ec2.host2,
                    deploy_path: '/var/www/cdn.digitru.st/prod'
                }
            },
        }

    });

    // Load plugins
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-strip-code');
    grunt.loadNpmTasks('grunt-karma');
    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-ssh-deploy');

    grunt.event.on('watch', function (action, filepath, target) {
        grunt.log.writeln(target + ': ' + filepath + ' has ' + action);
    });

    // Register tasks
    grunt.registerTask('default', ['copy', 'browserify', 'strip_code', 'uglify', 'karma']);
    grunt.registerTask('nokarma', ['copy', 'browserify', 'strip_code', 'uglify']);
    grunt.registerTask('generateKey', function () {
        var subtle = require('subtle');
        var jose = require('node-jose');
        var done = this.async();
        var keyPair,
            spki_pem,
            pkcs8_pem,
            KEY_JSON = {
                type: "RSA-OAEP",
                hash: {
                    name: "SHA-1"
                }
            };

        var argKeyVersion = grunt.option('keyversion');
        if (argKeyVersion === undefined || argKeyVersion < 1) {
            var er = 'ERROR: DO NOT FORGET the Key Version: grunt generateKey --keyversion 123';
            console.log(er);
            console.log(er);
            console.log(er);
            console.log(er);
            console.log(er);
            throw new Error();
        }
        KEY_JSON.version = parseInt(argKeyVersion);

        function arrayBufferToBase64String(arrayBuffer) {
            return arrayBuffer.toString('base64');
        }

        function convertBinaryToPem(binaryData, label) {
            var base64Cert = arrayBufferToBase64String(binaryData);
            var pemCert = "-----BEGIN " + label + "-----\n";

            var nextIndex = 0;
            var lineLength;
            while (nextIndex < base64Cert.length) {
                if (nextIndex + 64 <= base64Cert.length) {
                    pemCert += base64Cert.substr(nextIndex, 64) + "\n";
                } else {
                    pemCert += base64Cert.substr(nextIndex) + "\n";
                }
                nextIndex += 64;
            }

            pemCert += "-----END " + label + "-----\n";
            return pemCert;
        };

        subtle.generateKey({
            name: KEY_JSON.type,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),  // 24 bit representation of 65537
            hash: KEY_JSON.hash
        }, true, ["encrypt", "decrypt"])
        .then(function(newKeyPair) {
            keyPair = newKeyPair;
            return keyPair;
        })
        .then(function() {
            return subtle.exportKey('spki', keyPair.publicKey)
            .then(function(spki) {
                KEY_JSON.spki = arrayBufferToBase64String(spki);
                spki_pem = convertBinaryToPem(spki, "PUBLIC KEY");
                
                console.log('----------------------------');
                console.log('spki (Public Key PEM)');
                console.log('----------------------------');
                console.log(spki_pem);
            })
        })
        .then(function() {
            return subtle.exportKey('pkcs8', keyPair.privateKey)
            .then(function(pkcs8) {
                pkcs8_pem = convertBinaryToPem(pkcs8, "PRIVATE KEY");
                
                console.log('----------------------------');
                console.log('pkcs8 (Private Key PEM)');
                console.log('----------------------------');
                console.log(pkcs8_pem);
            });
        })
        .then(function() {
            return jose.JWK.asKey(pkcs8_pem, 'pem')
                .then( function(result) {
                    var jwkPublic = result.toJSON();
                    jwkPublic.alg = KEY_JSON.type;
                    jwkPublic.ext = true;
                    jwkPublic.key_ops = ["encrypt"];
                    KEY_JSON.jwk = jwkPublic;
                    console.log('----------------------------');
                    console.log('jwk Public');
                    console.log('----------------------------');
                    console.log(jwkPublic);

                    var jwkPrivate = result.toJSON(true);
                    jwkPrivate.alg = KEY_JSON.type;
                    jwkPrivate.ext = true;
                    jwkPrivate.key_ops = ["decrypt"];
                    console.log('----------------------------');
                    console.log('jwk Private');
                    console.log('----------------------------');
                    console.log(jwkPrivate);
                });
        })
        .then( function() {
            console.log('----------------------------');
            console.log('Public Keys in JSON format');
            console.log('----------------------------');
            console.log(JSON.stringify(KEY_JSON, null, 4));


            console.log('----------------------------');
            console.log('----------------------------');
            console.log('Remember to save JSON to /pages/key.json and /src/config/key.json');
            console.log('----------------------------');
            console.log('----------------------------');

            done();
        })
        .catch(function(err){
            console.log(err.stack)
        });
    });


    // Deployment tasks
    if (argEnv === 'prod') {
        grunt.registerTask('deploy1', ['default', 'ssh_deploy:prod1']);
        grunt.registerTask('deploy2', ['default', 'ssh_deploy:prod2']);
    } else if (argEnv === 'dev') {
        grunt.registerTask('deploy1', ['default', 'ssh_deploy:dev1']);
        grunt.registerTask('deploy2', ['default', 'ssh_deploy:dev2']);
    } else {
        var deployMissingEnv = function () {
            grunt.log.error('***************************************************');
            grunt.log.error('**');
            grunt.log.error('** Error: This task is missing --env');
            grunt.log.error('** Fix: Only able to deploy --env prod or --env dev');
            grunt.log.error('** See the deployment tasks in Gruntfile.js');
            grunt.log.error('**');
            grunt.log.error('** DID NOT DEPLOY');
            grunt.log.error('**');
            grunt.log.error('***************************************************');
        };
        grunt.registerTask('deploy1', deployMissingEnv);
        grunt.registerTask('deploy2', deployMissingEnv);
    }

    /*
        NOTE: Run "grunt watch --env local" while developing for auto-building with local env setting
    */
};
