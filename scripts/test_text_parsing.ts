
const parseInput = (text: string) => {
    return text.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
};

const tests = [
    { input: "A,B,C", expected: ["A", "B", "C"] },
    { input: "A，B，C", expected: ["A", "B", "C"] },
    { input: "A\nB\nC", expected: ["A", "B", "C"] },
    { input: " A , B ， C \n D ", expected: ["A", "B", "C", "D"] },
    { input: "Mixed,Separators\nAnd，Chinese", expected: ["Mixed", "Separators", "And", "Chinese"] },
    { input: "", expected: [] },
    { input: "   ", expected: [] }
];

let passed = true;
tests.forEach((t, i) => {
    const result = parseInput(t.input);
    const jsonResult = JSON.stringify(result);
    const jsonExpected = JSON.stringify(t.expected);
    if (jsonResult !== jsonExpected) {
        console.error(`Test ${i} FAILED: Input "${t.input}" -> Got ${jsonResult}, Expected ${jsonExpected}`);
        passed = false;
    } else {
        console.log(`Test ${i} PASSED`);
    }
});

if (passed) console.log("\n✅ All Text Parsing Tests Passed");
