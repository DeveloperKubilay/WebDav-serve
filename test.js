const axios = require('axios');
const fs = require('fs');

const propfindRequest = async () => {
    try {
        const response = await axios({
            method: 'PROPFIND',
            url: 'http://localhost:8080/test-smoke.txt',
            headers: {
  connection: 'Keep-Alive',
  'user-agent': 'Microsoft-WebDAV-MiniRedir/10.0.26100',
  depth: '0',
  translate: 'f',
  'content-length': '0',
  host: 'localhost:8080'
}
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