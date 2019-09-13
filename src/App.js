import React from 'react';
import Collapsible from 'react-collapsible';
import './App.css';

var mkFhir = require('fhir.js');

const supportedResourceTypes = ['Condition', 'Observation', 'Procedure'];

const localStorage = window.localStorage;

// https://stackoverflow.com/a/34890276
const groupBy = function(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

const Tablifier = (props) => {
  // props.keys = array
  if (!props || !props.keys || props.keys.length === 0) return null;

  const header = props.keys.map(k => <th scope="col" key={k}>{ k }</th>);
  const body = props.data.map((o,i) => <tr key={i}>{ props.keys.map(k => <td key={k}>{ o[k] }</td>) }</tr>);

  return (
    <table>
      <thead><tr>{ header }</tr></thead>
      <tbody>{ body }</tbody>
    </table>);
}

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.fields = {};

    this.state = {
      ...localStorage,

      // manually overridden from localStorage
      client: null,
      baseUrl: localStorage.getItem('baseUrl'),
      headerCount: Number(localStorage.getItem('headerCount')) || 0,
      searchCriteriaCount: Number(localStorage.getItem('searchCriteriaCount')) || 1
    };

    if (this.state.baseUrl) {}
  }

  setStateAndLocalStorage = (state) => {
    console.log(state);
    this.setState(state);
    for (let [key, value] of Object.entries(state)) {
      localStorage.setItem(key, value);
    }
  }

  applyServerSettings = () => {
    this.setState({ client: null });
    const baseUrl = this.fields['baseUrl'].value;

    if (!baseUrl || !baseUrl.trim()) return;

    localStorage.setItem('baseUrl', baseUrl);

    let headers = undefined;
    if (this.state.headerCount > 0) {
      headers = {};
      for (let i = 0; i < this.state.headerCount; i++) {
        const keyFieldId = `header_${i}_key`;
        const valueFieldId = `header_${i}_value`;

        const keyField = this.fields[keyFieldId];
        const valueField = this.fields[valueFieldId];

        if (keyField && valueField) {
          const key = keyField.value;
          const value = valueField.value;

          if (key && value) {
            headers[key] = value;
            localStorage.setItem(keyFieldId, key);
            localStorage.setItem(valueFieldId, value);
          }
        }
      }
    }

    fetch(`${baseUrl}/metadata`)
      .then(conformance => conformance.json(),
            _reason => { /* TODO: handle bad server */ } )
      .then(conformance => {
          const client = mkFhir({ baseUrl, headers });
          this.setStateAndLocalStorage({ client, conformance });
      });
  }

  addHeader = () => {
    const headerCount = this.state.headerCount + 1;
    this.setStateAndLocalStorage({ headerCount });
  }
  removeHeader = () => {
    const headerCount = Math.max(0, this.state.headerCount - 1);
    this.setStateAndLocalStorage({ headerCount });
  }

  addSearchCriteria = () => {
    const searchCriteriaCount = this.state.searchCriteriaCount + 1;
    this.setStateAndLocalStorage({ searchCriteriaCount });
  }
  removeSearchCriteria = () => {
    const searchCriteriaCount = Math.max(1, this.state.searchCriteriaCount - 1);
    this.setStateAndLocalStorage({ searchCriteriaCount });
  }

  setRefFn(id) {
    return (element) => this.fields[id] = element;
  } 

  renderHeaderFields() {
    const fields = [];

    for (let i = 0; i < this.state.headerCount; i++) {
      const id = `header_${i}`
      const key = `${id}_key`;
      const value = `${id}_value`;
      fields.push(
        <div key={id}>
          <label htmlFor={key}>Key</label><input type="text" name={key} defaultValue={this.state[key]} ref={this.setRefFn(key)}/>
          <label htmlFor={value}>Value</label><input type="text" name={value} defaultValue={this.state[value]} ref={this.setRefFn(value)}/>
          <br/>
        </div>);
    }

    return fields;
  }

  createDropdown(patientSearchParams, key) {
    const options = [];
    options.push(<option key="_" value=""></option>);
    for (const searchParam of patientSearchParams) {
      const name = searchParam.name;
      options.push(<option key={name} value={name}>{name}</option>);
    }

    return (<select id={key} ref={this.setRefFn(key)}> { options } </select>);
  }

  renderSearchCriteria(conformance) {
    if (!conformance
      || !conformance.rest
      || !conformance.rest[0]) return null;

    const patientSearchParams = conformance.rest[0].resource.find(r => r.type === "Patient").searchParam;

    const criteria = [];

    for (let i = 0 ; i < this.state.searchCriteriaCount ; i++) {
      const id = `criteria_${i}`
      const key = `${id}_key`;
      const value = `${id}_value`;
      const line = (<div key={i}>
          { this.createDropdown(patientSearchParams, key) }
          =  
          <input type="text" name={value} ref={this.setRefFn(value)}/>
          <br/>
        </div>);

      criteria.push( line );
    }

    return criteria;
  }

  performSearch = () => {
    const query = {};
    if (this.state.searchCriteriaCount > 0) {
      for (let i = 0; i < this.state.searchCriteriaCount; i++) {
        const keyFieldId = `criteria_${i}_key`;
        const valueFieldId = `criteria_${i}_value`;

        const keyField = this.fields[keyFieldId];
        const valueField = this.fields[valueFieldId];

        if (keyField && valueField) {
          const key = keyField.value;
          const value = valueField.value;

          if (key && value) {
            query[key] = value;
            localStorage.setItem(keyFieldId, key);
            localStorage.setItem(valueFieldId, value);
          }
        }
      }
    }

    this.state.client
      .search( { type: 'Patient', query })
      .then(result => this.setState({ searchResult: result.data }), err => console.log(err));
  }

  renderSearchResults(result) {
    // debugger;
    if (!result || !result.entry) return null;

    const list = [];
    for (const entry of result.entry) {
      const resource = entry.resource;
      const nameObj = resource.name[0];
      const name = `${nameObj.family}, ${nameObj.given[0]}`;
      list.push(<tr key={resource.id}>
          <td>{resource.id}</td>
          <td>{name}</td>
          <td>{resource.birthDate}</td>
          <td><button onClick={this.selectPatientAction(resource.id)}>Select</button></td>
        </tr>);
    }
    return (<table>
      <thead>
      <tr>
        <th scope="col">ID</th><th scope="col">Name</th><th scope="col">Birthdate</th><th>Select</th>
      </tr>
      </thead>
      <tbody>
      { list }
      </tbody>
      </table>);
  }

  selectPatientAction = (patientId) => {
    return () => {
      this.setState({ patientId });
      this.queryPatientDetails(patientId);
    };
  }

  queryPatientDetails = (patientId) => {
    const queries = [];

    for (const resourceType of supportedResourceTypes) {
      console.log('starting query for ' + resourceType);
      const query = this.state.client.search({type: resourceType, query: { patient: patientId }});
      queries.push(query);
    }

    Promise.all(queries).then(responses => {
      const allEntries = responses.map(r => r.data.entry).flat();

      const fakeBundle = {
        resourceType: 'Bundle',
        entry: allEntries
      };

      this.setState({ patient: fakeBundle });
    });
  }

  renderPatientDetails(patient) {
    if (!patient) return;

    const allResources = patient.entry.map(e => e.resource);

    const resourcesByType = groupBy(allResources, 'resourceType');

    return (
      <div>
        Conditions<br/>
        <Tablifier keys={['resourceType', 'id']} data={resourcesByType['Condition']} /><br/>
        Observations<br/>
        <Tablifier keys={['resourceType', 'id']} data={resourcesByType['Observation']} /><br/>
      </div>);
  }

  render() {
    const successImg = (<img src="success.png" style={{ height: '20px' }}/>);
    const serverSettingsTitle = (<div>
      Server Settings
      { this.state.client && successImg }
      </div>);
    const patientSearchTitle = (<div>
      Patient Search
      { this.state.patient && successImg }
      </div>);
    return (
      <div className="App">
        <Collapsible trigger={serverSettingsTitle} open={!this.state.client}>
          <label htmlFor="baseUrl">Base URL:</label>
          <input type="text" name="baseUrl" id="baseUrl" defaultValue={this.state.baseUrl} ref={this.setRefFn('baseUrl')}/>
          <br/><br/>
          <label>Request Headers</label><br/>
          { this.renderHeaderFields() }
          <button onClick={this.addHeader}>+</button><button onClick={this.removeHeader}>-</button>
          <br/>
          <button onClick={this.applyServerSettings}>Apply and Connect</button>
        </Collapsible>
        <Collapsible trigger={patientSearchTitle} open={!!this.state.client && !this.state.patientId}>
          { this.renderSearchCriteria(this.state.conformance) }
          <button onClick={this.addSearchCriteria}>+</button><button onClick={this.removeSearchCriteria}>-</button>
          <br/><br/>
          <button onClick={this.performSearch}>Search</button>
          { this.renderSearchResults(this.state.searchResult) }
        </Collapsible>
        <Collapsible trigger="Patient Details" open={!!this.state.patientId}>
          { this.renderPatientDetails(this.state.patient) }
        </Collapsible>
      </div>
    );
  }
}
