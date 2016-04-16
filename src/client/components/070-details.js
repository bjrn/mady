import React                from 'react';
import Relay                from 'react-relay';
import moment               from 'moment';
import { COLORS }           from '../gral/constants';
import {
  flexItem,
}                           from './helpers';

// ==========================================
// Relay fragments
// ==========================================
const fragments = {
  viewer: () => Relay.QL`
    fragment on Viewer {
      anyNode(id: $selectedKeyId) {
        ... on Key {
          context text
          firstUsed unusedSince
          sources
        }
      }
    }
  `,
};

// ==========================================
// Component
// ==========================================
class Details extends React.Component {
  static propTypes = {
    viewer:                 React.PropTypes.object.isRequired,
    selectedKeyId:          React.PropTypes.string,
  };

  componentWillReceiveProps(nextProps) {
    this.props.relay.setVariables({ selectedKeyId: nextProps.selectedKeyId });
  }

  render() {
    this._theKey = this.props.viewer.anyNode;
    return (
      <div style={style.outer}>
        <div style={style.title}>DETAILS</div>
        {this.renderContents()}
      </div>
    );
  }

  renderContents() {
    if (!this._theKey) return <i>Details for the selected key will be shown here</i>;
    const { text } = this._theKey;
    return (
      <div>
        <div style={style.text}>{text}</div>
        {this.renderSources()}
      </div>
    );
  }

  renderSources() {
    const { sources, firstUsed, unusedSince } = this._theKey;
    const since = this.renderDate(firstUsed);
    const until = unusedSince 
      ? <span> until {this.renderDate(unusedSince)}</span>
      : ':';
    const elSources = sources.length
      ? <ul style={style.srcList}>
          {sources.map((src, idx) => <li key={idx}>{src}</li>)}
        </ul>
      : null;
    return (
      <div>
        Used since {since}{until}
        {elSources}
      </div>
    );
  }

  renderDate(d) {
    return (
      <span title={moment(d).format('LLLL')} style={style.date}>
        {moment(d).fromNow()}
      </span>
    );
  }
}

// ==========================================
// Styles
// ==========================================
const style = {
  outer: flexItem('none', {
    minHeight: 130,
    backgroundColor: COLORS.mediumBlue,
    padding: 5,
    marginTop: 5,
  }),
  title: {
    fontWeight: 900,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    marginBottom: 5,
    fontWeight: 'bold',
  },
  date: {
    fontWeight: 'bold',
    color: '#444',
  },
  srcList: {
    marginTop: 0,
  },
};

// ==========================================
// Public API
// ==========================================
export default Relay.createContainer(Details, { 
  fragments,
  initialVariables: { selectedKeyId: null },
});