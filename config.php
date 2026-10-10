<?php
// Portside configuration. Edit these values, then open /install.php once.
return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'portside',
        'user'    => 'root',          // XAMPP default. On cPanel use your prefixed user (cpuser_name)
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    // Used to encrypt saved FTP/database passwords. Set a long random string BEFORE
    // creating accounts. Changing it later makes saved passwords unreadable.
    'app_key' => 'Simthandile_1',

    // Set to false on a public server so users can't point Portside at your internal network.
    'allow_private_hosts' => true,

    'open_registration' => true,
];
