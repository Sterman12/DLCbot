import validator from 'validator';
export class imdbAPIHandler {
    constructor(timeoutMS = 5000) {
        this.timeout = timeoutMS;
        // space to add other options etc

    }

 async getParentsGuide(dlcLink, category) {
    let cleanedString = stringCleanup(dlcLink);
    let index;
    let highestResponses = 0;
    let highestResponsesIndex = 0;
    try {
        let response = await fetch(`https://api.imdbapi.dev/titles/${cleanedString}/parentsGuide`, {
            signal: AbortSignal.timeout(this.timeout),
            method: 'GET',
            headers: {
                'Content-type': 'application/json'
            }
        });
        let ratingResponse = await response.json()
        for (let i = 0; i < ratingResponse.parentsGuide.length; i++) {
            if (category == ratingResponse.parentsGuide[i].category) {
                index = i;
                break;
            }
        }
        console.log(ratingResponse.parentsGuide[index].severityBreakdowns);
        for (let i = 0; i < ratingResponse.parentsGuide[index].severityBreakdowns.length; i++) {
            if (highestResponses < ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount) {
                highestResponses = ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount;
                highestResponsesIndex = i;
                continue;
            }
        }
        console.log(ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel);
        let returnString = `has level of category ${category} : ` + ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel;
        return returnString;
    }
    catch (error) {
        console.error("error retrieving sexual content warning: ", error, "for:  ", dlcLink)
        return "unsucessful in retrieving sexual content warning";
    }
}

async imdbLookup(movieName) {
    const s = (movieName || '').trim();
    if (!s) {
        console.log('imdbLookup called without a movie name');
        return null;
    }
    try {
        const res = await fetch(
            `https://api.imdbapi.dev/search/titles?query=${encodeURIComponent(s)}&limit=1`,
            {
                signal: AbortSignal.timeout(this.timeout), // how to handle a unitinialized class (dochmm)
                method: 'GET',
                headers: { 'Content-type': 'application/json' }
            }
        );
        const data = await res.json();
        return `https://www.imdb.com/title/${data.titles[0].id}`;
    } catch (err) {
        console.error('imdbLookup error:', err);
        return 'Could not find movie on IMDB.';
    }
}
}
function stringCleanup(str) {
    return validator.whitelist(str.trim(), 'a-zA-Z0-9 ');
}