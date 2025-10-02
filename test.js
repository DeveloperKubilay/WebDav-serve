const axios = require('axios');
const fs = require('fs');

const propfindRequest = async () => {
    try {
        const response = await axios({
            method: 'HEAD',
            url: 'http://localhost:8080/tests/files/test-smoke.txt',  // Güncellenen URL
            headers: {
  connection: 'Keep-Alive',
  'user-agent': 'Microsoft-WebDAV-MiniRedir/10.0.26100',
  host: 'localhost:8080'
},
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