const axios = require('axios');
const fs = require('fs');

const propfindRequest = async () => {
    try {
        const response = await axios({
            method: 'PROPPATCH',
            url: 'http://localhost:8081/test-smoke.txt',  // Güncellenen URL
            headers: {'cache-control': 'no-cache',
  connection: 'Keep-Alive',
  pragma: 'no-cache',
  'content-type': 'text/xml; charset="utf-8"',
  'user-agent': 'Microsoft-WebDAV-MiniRedir/10.0.26100',
  if: '(<5eba015d36111d43ff54378ad6621718>)',
  translate: 'f',
  'content-length': '316',
  host: 'localhost:8080'}
        });

        console.log('Data:', response.data);
        console.log('Status:', response.status);
        console.log('Response Headers:', response.headers);

        fs.writeFileSync('response.xml', response.data);
        return response.data;
    } catch (error) {
        console.log('Hata:', error.message);
        console.log('Full error:', error);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response data:', error.response.data);
        }
    }
};

propfindRequest();